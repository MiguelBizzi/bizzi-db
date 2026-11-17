const analytics = db.getSiblingDB("analytics");
analytics.dropDatabase();

// ---- metrics (time-series) ----

analytics.createCollection("metrics", {
  timeseries: { timeField: "ts", metaField: "meta", granularity: "minutes" },
});

const start = Date.UTC(2025, 0, 1);
analytics.metrics.insertMany(
  Array.from({ length: 120 }, (_, i) => ({
    ts: new Date(start + i * 60 * 1000),
    meta: { host: `web-${(i % 3) + 1}`, region: i % 2 ? "eu-west" : "us-east" },
    cpu: 10 + ((i * 13) % 80),
    memoryMb: 512 + ((i * 29) % 1024),
  })),
);
