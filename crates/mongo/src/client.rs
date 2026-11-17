use std::time::Duration;

use db_core::{ConnectConfig, SslMode};
use mongodb::options::{
    AuthMechanism, ClientOptions, Credential, ReadPreference, SelectionCriteria, ServerAddress,
    Tls, TlsOptions,
};

const TIMEOUT: Duration = Duration::from_secs(10);

/// Options for a `mongodb://` seed list, built without network access. SRV
/// profiles need DNS and go through `resolve_options`.
pub fn client_options(
    cfg: &ConnectConfig,
    tunnel_port: Option<u16>,
) -> Result<ClientOptions, String> {
    let hosts = match tunnel_port {
        Some(port) => vec![ServerAddress::Tcp {
            host: "127.0.0.1".into(),
            port: Some(port),
        }],
        None if is_srv(cfg) => {
            return Err("SRV connections are resolved through DNS; use resolve_options".into())
        }
        None => seed_hosts(cfg)?,
    };
    let mut opts = ClientOptions::builder().hosts(hosts).build();
    apply_profile(&mut opts, cfg, tunnel_port.is_some())?;
    Ok(opts)
}

/// Like `client_options`, but resolves `mongodb+srv://` profiles. The SRV
/// string carries no credentials, so the password never enters a URI.
pub async fn resolve_options(
    cfg: &ConnectConfig,
    tunnel_port: Option<u16>,
) -> Result<ClientOptions, String> {
    if tunnel_port.is_some() || !is_srv(cfg) {
        return client_options(cfg, tunnel_port);
    }
    let host = cfg.host.trim();
    if host.is_empty() || host.contains(['/', '@', '?', ':', ',', '#']) {
        return Err("SRV needs a host name without a port, such as cluster0.example.net".into());
    }
    let mut opts = ClientOptions::parse(format!("mongodb+srv://{host}/"))
        .await
        .map_err(|e| e.to_string())?;
    apply_profile(&mut opts, cfg, false)?;
    Ok(opts)
}

fn param<'a>(cfg: &'a ConnectConfig, key: &str) -> Option<&'a str> {
    cfg.params
        .get(key)
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
}

fn is_srv(cfg: &ConnectConfig) -> bool {
    param(cfg, "srv") == Some("true")
}

fn seed_hosts(cfg: &ConnectConfig) -> Result<Vec<ServerAddress>, String> {
    let host = cfg.host.trim();
    if host.is_empty() {
        return Err("Host is required".into());
    }
    let mut hosts = vec![ServerAddress::Tcp {
        host: host.into(),
        port: Some(cfg.port),
    }];
    for entry in param(cfg, "hosts").unwrap_or_default().split(',') {
        let entry = entry.trim();
        if !entry.is_empty() {
            hosts.push(ServerAddress::parse(entry).map_err(|e| e.to_string())?);
        }
    }
    Ok(hosts)
}

/// Applies the profile on top of a seed list or a resolved SRV record. A
/// tunnel reaches exactly one server, so it always connects directly.
fn apply_profile(
    opts: &mut ClientOptions,
    cfg: &ConnectConfig,
    tunneled: bool,
) -> Result<(), String> {
    opts.app_name = Some("Bizzi DB".into());
    opts.server_selection_timeout = Some(TIMEOUT);
    opts.connect_timeout = Some(TIMEOUT);
    opts.max_pool_size = Some(cfg.pool_size);
    opts.tls = Some(match cfg.ssl_mode {
        SslMode::Disabled => Tls::Disabled,
        SslMode::Require => TlsOptions::builder()
            .allow_invalid_certificates(true)
            .build()
            .into(),
        SslMode::Enabled => Tls::Enabled(TlsOptions::default()),
    });
    opts.credential = if cfg.user.is_empty() {
        None
    } else {
        let mechanism = param(cfg, "authMechanism")
            .map(|m| m.parse::<AuthMechanism>().map_err(|e| e.to_string()))
            .transpose()?;
        // An SRV TXT record may name the auth database; it beats the profile database.
        let source = param(cfg, "authSource")
            .map(str::to_string)
            .or_else(|| opts.credential.take().and_then(|c| c.source))
            .or_else(|| Some(cfg.database.clone()).filter(|d| !d.is_empty()))
            .unwrap_or_else(|| "admin".into());
        Some(
            Credential::builder()
                .username(cfg.user.clone())
                .password(cfg.password.clone())
                .source(source)
                .mechanism(mechanism)
                .build(),
        )
    };
    if let Some(name) = param(cfg, "replicaSet") {
        opts.repl_set_name = Some(name.into());
    }
    if let Some(pref) = param(cfg, "readPreference") {
        let pref = match pref {
            "primary" => ReadPreference::Primary,
            "primaryPreferred" => ReadPreference::PrimaryPreferred { options: None },
            "secondary" => ReadPreference::Secondary { options: None },
            "secondaryPreferred" => ReadPreference::SecondaryPreferred { options: None },
            "nearest" => ReadPreference::Nearest { options: None },
            other => return Err(format!("Unknown read preference {other}")),
        };
        opts.selection_criteria = Some(SelectionCriteria::ReadPreference(pref));
    }
    opts.direct_connection = if tunneled {
        Some(true)
    } else {
        match param(cfg, "directConnection") {
            Some("true") => Some(true),
            Some("false") => Some(false),
            _ => opts.direct_connection,
        }
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use db_core::{DatabaseDialect, SslMode};
    use mongodb::options::{AuthMechanism, ReadPreference, SelectionCriteria, ServerAddress, Tls};
    use std::collections::BTreeMap;
    use std::time::Duration;

    fn cfg(params: &[(&str, &str)]) -> ConnectConfig {
        ConnectConfig {
            dialect: DatabaseDialect::MongoDB,
            host: "db.example".into(),
            port: 27017,
            database: String::new(),
            user: String::new(),
            password: String::new(),
            ssl_mode: SslMode::Disabled,
            pool_size: 4,
            params: params
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect::<BTreeMap<_, _>>(),
        }
    }

    fn addr(host: &str, port: u16) -> ServerAddress {
        ServerAddress::Tcp {
            host: host.into(),
            port: Some(port),
        }
    }

    #[test]
    fn tls_modes_map() {
        let mut c = cfg(&[]);
        assert_eq!(client_options(&c, None).unwrap().tls, Some(Tls::Disabled));

        c.ssl_mode = SslMode::Require;
        let Some(Tls::Enabled(tls)) = client_options(&c, None).unwrap().tls else {
            panic!("TLS should be on for Require");
        };
        assert_eq!(tls.allow_invalid_certificates, Some(true));

        c.ssl_mode = SslMode::Enabled;
        let Some(Tls::Enabled(tls)) = client_options(&c, None).unwrap().tls else {
            panic!("TLS should be on for Enabled");
        };
        assert_ne!(tls.allow_invalid_certificates, Some(true));
    }

    #[test]
    fn credential_set_only_with_user() {
        let mut c = cfg(&[]);
        assert!(client_options(&c, None).unwrap().credential.is_none());

        c.user = "app".into();
        c.password = "pw".into();
        let cred = client_options(&c, None).unwrap().credential.unwrap();
        assert_eq!(cred.username.as_deref(), Some("app"));
        assert_eq!(cred.password.as_deref(), Some("pw"));
        assert_eq!(cred.source.as_deref(), Some("admin"));
        assert_eq!(cred.mechanism, None);

        c.database = "shop".into();
        let cred = client_options(&c, None).unwrap().credential.unwrap();
        assert_eq!(cred.source.as_deref(), Some("shop"));

        c.params = cfg(&[("authSource", "users"), ("authMechanism", "SCRAM-SHA-256")]).params;
        let cred = client_options(&c, None).unwrap().credential.unwrap();
        assert_eq!(cred.source.as_deref(), Some("users"));
        assert_eq!(cred.mechanism, Some(AuthMechanism::ScramSha256));
    }

    #[test]
    fn tunnel_forces_direct_connection() {
        let c = cfg(&[("directConnection", "false")]);
        let opts = client_options(&c, Some(40000)).unwrap();
        assert_eq!(opts.hosts, [addr("127.0.0.1", 40000)]);
        assert_eq!(opts.direct_connection, Some(true));
    }

    #[test]
    fn extra_hosts_added() {
        let c = cfg(&[
            ("hosts", " b:27018, c:27019 ,"),
            ("replicaSet", "rs0"),
            ("readPreference", "secondaryPreferred"),
            ("directConnection", "false"),
        ]);
        let opts = client_options(&c, None).unwrap();
        assert_eq!(
            opts.hosts,
            [
                addr("db.example", 27017),
                addr("b", 27018),
                addr("c", 27019)
            ]
        );
        assert_eq!(opts.repl_set_name.as_deref(), Some("rs0"));
        assert_eq!(opts.direct_connection, Some(false));
        assert_eq!(
            opts.selection_criteria,
            Some(SelectionCriteria::ReadPreference(
                ReadPreference::SecondaryPreferred { options: None }
            ))
        );
    }

    #[test]
    fn fixed_client_settings() {
        let opts = client_options(&cfg(&[]), None).unwrap();
        assert_eq!(opts.app_name.as_deref(), Some("Bizzi DB"));
        assert_eq!(opts.server_selection_timeout, Some(Duration::from_secs(10)));
        assert_eq!(opts.connect_timeout, Some(Duration::from_secs(10)));
        assert_eq!(opts.direct_connection, None);
        assert!(client_options(&cfg(&[("srv", "true")]), None).is_err());
    }

    #[test]
    fn options_debug_has_no_password() {
        let mut c = cfg(&[]);
        c.user = "app".into();
        c.password = "hunter2-very-secret".into();
        let opts = client_options(&c, None).unwrap();
        assert!(!format!("{opts:?}").contains("hunter2-very-secret"));
    }
}
