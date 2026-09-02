use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use db_core::{SshTunnelAuth, SshTunnelConfig};
use ssh2::Session;

pub struct SshTunnel {
    local_port: u16,
    shutdown: Arc<AtomicBool>,
    _session: Arc<Mutex<Session>>,
    _worker: thread::JoinHandle<()>,
}

impl SshTunnel {
    pub fn local_port(&self) -> u16 {
        self.local_port
    }

    pub async fn open(
        ssh: &SshTunnelConfig,
        dest_host: &str,
        dest_port: u16,
    ) -> Result<Self, String> {
        let ssh = ssh.clone();
        let dest_host = dest_host.to_string();
        tokio::task::spawn_blocking(move || open_blocking(&ssh, &dest_host, dest_port))
            .await
            .map_err(|e| format!("SSH tunnel task failed: {e}"))?
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

fn open_blocking(
    ssh: &SshTunnelConfig,
    dest_host: &str,
    dest_port: u16,
) -> Result<SshTunnel, String> {
    let tcp = TcpStream::connect((ssh.host.as_str(), ssh.port))
        .map_err(|e| format!("SSH connect failed: {e}"))?;
    let mut session = Session::new().map_err(|e| format!("SSH session failed: {e}"))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| format!("SSH handshake failed: {e}"))?;
    authenticate(&session, ssh)?;
    session.set_timeout(50);

    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("SSH tunnel bind failed: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("SSH tunnel bind failed: {e}"))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| format!("SSH tunnel address failed: {e}"))?
        .port();

    let session = Arc::new(Mutex::new(session));
    let shutdown = Arc::new(AtomicBool::new(false));
    let worker_session = session.clone();
    let worker_shutdown = shutdown.clone();
    let dest_host = dest_host.to_string();
    let worker = thread::spawn(move || {
        while !worker_shutdown.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((local, _)) => {
                    let session = worker_session.clone();
                    let dest_host = dest_host.clone();
                    thread::spawn(move || {
                        if let Ok(session) = session.lock() {
                            match session.channel_direct_tcpip(&dest_host, dest_port, None) {
                                Ok(channel) => pump(local, channel),
                                Err(_) => {}
                            }
                        }
                    });
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(25));
                }
                Err(_) => break,
            }
        }
    });

    Ok(SshTunnel {
        local_port,
        shutdown,
        _session: session,
        _worker: worker,
    })
}

fn authenticate(session: &Session, ssh: &SshTunnelConfig) -> Result<(), String> {
    match &ssh.auth {
        SshTunnelAuth::Password { password } => session
            .userauth_password(&ssh.user, password)
            .map_err(|e| format!("SSH password auth failed: {e}"))?,
        SshTunnelAuth::PrivateKey { path, passphrase } => session
            .userauth_pubkey_file(
                &ssh.user,
                None,
                Path::new(path),
                passphrase.as_deref(),
            )
            .map_err(|e| format!("SSH key auth failed: {e}"))?,
    }
    if !session.authenticated() {
        return Err("SSH authentication failed".into());
    }
    Ok(())
}

fn pump(mut local: TcpStream, mut channel: ssh2::Channel) {
    let mut incoming = [0u8; 16 * 1024];
    let mut outgoing = [0u8; 16 * 1024];
    local.set_nodelay(true).ok();
    local
        .set_read_timeout(Some(Duration::from_millis(50)))
        .ok();
    loop {
        match local.read(&mut incoming) {
            Ok(0) => {
                let _ = channel.send_eof();
                break;
            }
            Ok(n) => {
                if channel.write_all(&incoming[..n]).is_err() {
                    break;
                }
            }
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
        match channel.read(&mut outgoing) {
            Ok(0) => break,
            Ok(n) => {
                if local.write_all(&outgoing[..n]).is_err() {
                    break;
                }
            }
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
        if channel.eof() {
            break;
        }
    }
    let _ = channel.close();
}
