use tokio::net::TcpStream;
use tokio_util::compat::Compat;

pub(crate) type SqlClient = tiberius::Client<Compat<TcpStream>>;
