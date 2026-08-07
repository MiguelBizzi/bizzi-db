import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini SDK with User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Endpoint: AI SQL Generator
app.post("/api/ai/sql-generate", async (req, res) => {
  try {
    const { prompt, schemaContext, dialect = "PostgreSQL" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const systemInstruction = `
You are an expert Database Administrator and Senior SQL Architect specializing in ${dialect}.
Given the schema context and natural language prompt, generate optimal, clean, well-formatted SQL queries.
Return your response in pure JSON format adhering strictly to this JSON schema:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what the query does...",
  "tablesUsed": ["table1", "table2"],
  "estimatedComplexity": "Simple" | "Moderate" | "Complex",
  "optimizationNotes": "Optional index or performance tips"
}
`;

    const contents = `
Dialect: ${dialect}
Schema Context:
${JSON.stringify(schemaContext || {}, null, 2)}

User Request:
${prompt}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText);
    return res.json(data);
  } catch (error: any) {
    console.error("Error in /api/ai/sql-generate:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate SQL",
      sql: "-- Failed to generate query via AI\nSELECT * FROM orders LIMIT 10;",
      explanation: "An error occurred while contacting the AI assistant. A default fallback query was generated.",
      tablesUsed: ["orders"],
      estimatedComplexity: "Simple",
    });
  }
});

// API Endpoint: AI SQL Explanation
app.post("/api/ai/sql-explain", async (req, res) => {
  try {
    const { sql, schemaContext, dialect = "PostgreSQL" } = req.body;

    if (!sql) {
      return res.status(400).json({ error: "SQL query is required" });
    }

    const systemInstruction = `
You are a senior SQL database expert. Explain the following ${dialect} query clearly in simple developer terms.
Provide a step-by-step breakdown, identify potential edge cases or performance bottlenecks, and explain the output columns.
Return JSON:
{
  "summary": "High level summary...",
  "stepByStep": ["Step 1...", "Step 2..."],
  "performanceAnalysis": "Analysis of efficiency, indexes, scans...",
  "columnsReturned": ["col1", "col2"]
}
`;

    const contents = `
Dialect: ${dialect}
Schema Context:
${JSON.stringify(schemaContext || {}, null, 2)}

SQL Query:
${sql}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const data = JSON.parse(response.text || "{}");
    return res.json(data);
  } catch (error: any) {
    console.error("Error in /api/ai/sql-explain:", error);
    return res.status(500).json({
      error: error.message || "Failed to explain SQL",
      summary: "This query retrieves data from the database tables based on specified joins and filtering clauses.",
      stepByStep: ["1. Scans target table", "2. Filters records according to WHERE conditions", "3. Sorts and returns results"],
      performanceAnalysis: "Consider adding indexes on filtered and joined columns for larger datasets.",
      columnsReturned: [],
    });
  }
});

// API Endpoint: AI SQL Optimizer & Index Advisor
app.post("/api/ai/sql-optimize", async (req, res) => {
  try {
    const { sql, schemaContext, dialect = "PostgreSQL" } = req.body;

    if (!sql) {
      return res.status(400).json({ error: "SQL query is required" });
    }

    const systemInstruction = `
You are a Database Performance Engineer. Analyze the given ${dialect} query and schema.
Suggest structural optimizations, rewritten SQL query, index creation recommendations, and query plan improvements.
Return JSON:
{
  "optimizedSql": "Rewritten optimized SQL...",
  "improvements": ["Improvement 1...", "Improvement 2..."],
  "indexRecommendations": [
    "CREATE INDEX idx_users_email ON users(email);",
    "CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);"
  ],
  "estimatedPerformanceGain": "35-50% speedup"
}
`;

    const contents = `
Dialect: ${dialect}
Schema Context:
${JSON.stringify(schemaContext || {}, null, 2)}

Original Query:
${sql}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const data = JSON.parse(response.text || "{}");
    return res.json(data);
  } catch (error: any) {
    console.error("Error in /api/ai/sql-optimize:", error);
    return res.status(500).json({
      error: error.message || "Failed to optimize SQL",
      optimizedSql: req.body?.sql || "",
      improvements: ["Use specific column names instead of SELECT *", "Ensure foreign key columns are indexed"],
      indexRecommendations: ["CREATE INDEX IF NOT EXISTS idx_active ON target_table(id);"],
      estimatedPerformanceGain: "10-20%",
    });
  }
});

// API Endpoint: AI SQL Error Fixer
app.post("/api/ai/sql-fix", async (req, res) => {
  try {
    const { sql, errorMessage, schemaContext, dialect = "PostgreSQL" } = req.body;

    if (!sql || !errorMessage) {
      return res.status(400).json({ error: "SQL and errorMessage are required" });
    }

    const systemInstruction = `
You are a SQL Debugger. The user's query failed with an error.
Analyze the error message and SQL query, then provide the corrected SQL and a clear explanation of what went wrong.
Return JSON:
{
  "fixedSql": "Corrected SQL query...",
  "rootCause": "Explanation of the syntax or logic error...",
  "changesMade": "Details of the fix..."
}
`;

    const contents = `
Dialect: ${dialect}
Failed SQL:
${sql}

Error Received:
${errorMessage}

Schema Context:
${JSON.stringify(schemaContext || {}, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const data = JSON.parse(response.text || "{}");
    return res.json(data);
  } catch (error: any) {
    console.error("Error in /api/ai/sql-fix:", error);
    return res.status(500).json({
      error: error.message || "Failed to fix SQL",
      fixedSql: req.body?.sql || "",
      rootCause: "Syntax error or unknown identifier",
      changesMade: "Please check table and column names.",
    });
  }
});

async function startServer() {
  // Vite middleware setup for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Database Client Workspace] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
