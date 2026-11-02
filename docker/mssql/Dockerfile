# SQL Server 2022 publishes x86-64 images only. On arm64, Docker Desktop runs this
# with Rosetta or QEMU (`platform: linux/amd64` in compose). The engine wants about 2 GB of RAM.
FROM mcr.microsoft.com/mssql/server:2022-latest

USER root
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY init /init
RUN chmod 755 /usr/local/bin/entrypoint.sh && chown -R mssql:mssql /init
USER mssql

ENV ACCEPT_EULA=Y \
    MSSQL_PID=Developer

EXPOSE 1433
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
