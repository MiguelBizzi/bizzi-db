# MongoDB and a multi-paradigm engine boundary

MongoDB is the fourth engine and the first that is not relational. The engine boundary grows a paradigm axis (`relational` | `document`) so a document engine plugs in beside the SQL engines without pretending a collection is a table. Implementation plan: `docs/superpowers/plans/2026-11-17-mongodb-multi-paradigm.md`.

## Brief

Bizzi DB supports PostgreSQL, MySQL, and SQL Server. MongoDB must reach functional parity, adapted to documents:

- **Connection:** MongoDB connection strings (`mongodb://`, `mongodb+srv://`) and authentication.
- **Introspection:** databases and collections, not schemas and tables.
- **Data viewing:** JSON documents, including nested objects and arrays, in a navigable view that replaces the grid.
- **Querying:** an editor for MongoDB's query language and execution model.
- **Data editing:** modify fields, add fields, edit nested structures.
- **Indexes:** view and manage collection indexes.
- **Export:** collection data as JSON arrays, accurately.

Architectural requirements:

- The core app (UI, state) stays engine-agnostic. MongoDB logic lives inside its own boundary.
- A document is not a row. Where MongoDB differs from SQL, the product shows the difference instead of hiding it.
- PostgreSQL, MySQL, and SQL Server keep working exactly as before.
- The next paradigm (key-value, graph) is added by filling in the same boundary, not by re-architecting.

Success: users connect to MongoDB, browse collections, inspect and edit documents; the UI feels designed for documents; the abstraction handles both models; no SQL regression.

## Capability table

Filled in by the plan's last task.

## Parity matrix

Filled in by the plan's last task.
