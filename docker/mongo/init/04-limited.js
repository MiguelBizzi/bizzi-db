// Can read shop's documents and collection names but not their stats or
// indexes, so introspection is tested against refused $collStats and listIndexes.
const admin = db.getSiblingDB("admin");
if (admin.getUser("limited")) admin.dropUser("limited");
if (admin.getRole("limitedReader")) admin.dropRole("limitedReader");
admin.createRole({
  role: "limitedReader",
  privileges: [{ resource: { db: "shop", collection: "" }, actions: ["find", "listCollections"] }],
  roles: [],
});
admin.createUser({ user: "limited", pwd: "limited", roles: [{ role: "limitedReader", db: "admin" }] });
