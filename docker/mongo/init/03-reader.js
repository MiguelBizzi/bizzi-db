// A user without listDatabases and without access to analytics, so the client
// is tested the way a least-privilege Atlas user connects.
const admin = db.getSiblingDB("admin");
if (admin.getUser("reader")) admin.dropUser("reader");
admin.createUser({ user: "reader", pwd: "reader", roles: [{ role: "read", db: "shop" }] });
