const shop = db.getSiblingDB("shop");
shop.dropDatabase();

// Fixed ids so orders can reference users and tests can name a document.
const userId = (i) => ObjectId("65a000000000000000" + i.toString(16).padStart(6, "0"));

// ---- users ----

const names = [
  "Ada Lovelace", "Alan Turing", "Grace Hopper", "Edsger Dijkstra", "Barbara Liskov",
  "Donald Knuth", "Margaret Hamilton", "Dennis Ritchie", "Ken Thompson", "Frances Allen",
  "John McCarthy", "Radia Perlman", "Niklaus Wirth", "Hedy Lamarr", "Tony Hoare",
  "Leslie Lamport", "Shafi Goldwasser", "Bjarne Stroustrup", "Katherine Johnson", "Guido van Rossum",
  "Anita Borg", "Linus Torvalds", "Jean Sammet", "Tim Berners-Lee",
];
const cities = [
  ["Lisbon", "PT"], ["London", "GB"], ["New York", "US"], ["Amsterdam", "NL"], ["Boston", "US"],
  ["Stanford", "US"], ["Paris", "FR"], ["São Paulo", "BR"],
];
const tagSets = [["admin"], ["beta", "newsletter"], [], ["vip", "beta"], ["newsletter"]];

shop.users.insertMany(
  names.map((name, i) => {
    const [city, country] = cities[i % cities.length];
    const user = {
      _id: userId(i + 1),
      name,
      email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
      age: 20 + ((i * 7) % 45),
      address: { street: `${i + 10} Main Street`, city, country, zip: String(10000 + i * 37) },
      tags: tagSets[i % tagSets.length],
      credits: NumberLong(String(i * 1000)),
      balance: NumberDecimal(`${i * 12}.50`),
      createdAt: new Date(Date.UTC(2024, i % 12, 1 + i, 9, 30)),
      bio: `${name} writes about ${i % 2 ? "compilers and languages" : "systems and networks"}.`,
      active: i % 4 !== 3,
    };
    if (i === 5) delete user.email;
    if (i === 6) user.age = "thirty-one";
    return user;
  }),
);

shop.users.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } },
);
shop.users.createIndex({ bio: "text" });

// ---- orders ----

const skus = [
  ["KB-01", "12.00"], ["MS-02", "24.90"], ["MN-27", "189.00"], ["CB-05", "7.25"], ["HD-11", "59.99"],
];
const statuses = ["pending", "paid", "shipped", "delivered", "cancelled"];

shop.orders.insertMany(
  Array.from({ length: 40 }, (_, i) => {
    const items = Array.from({ length: 1 + (i % 3) }, (_, j) => {
      const [sku, price] = skus[(i + j) % skus.length];
      return { sku, qty: 1 + ((i + j) % 4), price: NumberDecimal(price) };
    });
    const cents = items.reduce(
      (sum, item) => sum + item.qty * Math.round(Number(item.price.toString()) * 100),
      0,
    );
    return {
      userId: userId((i % names.length) + 1),
      items,
      total: NumberDecimal((cents / 100).toFixed(2)),
      status: statuses[i % statuses.length],
      createdAt: new Date(Date.UTC(2025, i % 12, 1 + (i % 28), 14)),
    };
  }),
);

shop.orders.createIndex({ userId: 1, createdAt: -1 });
shop.orders.createIndex({ status: 1 }, { hidden: true });

// ---- events ----

shop.createCollection("events", { capped: true, size: 1024 * 1024 });
shop.events.insertMany(
  Array.from({ length: 50 }, (_, i) => ({
    type: ["login", "logout", "purchase", "error"][i % 4],
    userId: userId((i % names.length) + 1),
    at: new Date(),
  })),
);
shop.events.createIndex({ at: 1 }, { expireAfterSeconds: 3600 });

// ---- odd_keys ----

// A Map keeps "10" before "2"; a JavaScript object would sort integer-like keys
// first. mongosh's insertOne drops a Map's entries, so this sends the insert
// command (what insertOne sends) directly. The server stores dotted and nested
// $-prefixed names as written; a top-level $ key could read as an operator.
shop.runCommand({
  insert: "odd_keys",
  documents: [
    new Map([
      ["_id", 1],
      ["10", "ten"],
      ["2", "two"],
      ["a.b", "dotted"],
      ["", "empty"],
      ["meta", new Map([["$x", 1], ["c.d", 2]])],
      ["note", "edit me"],
    ]),
  ],
});

// ---- views ----

shop.createView("active_users", "users", [
  { $match: { active: true } },
  { $project: { name: 1, email: 1, address: 1 } },
]);
