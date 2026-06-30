// Stateful mock BSC JSON-RPC server — Sprint 25B local simulation.
// Phase 1: 3 confirmations  → WAITING_CONFIRMATIONS
// Phase 2: 14 confirmations → CONFIRMED → COMPLETED
// Control: POST /control { "phase": 2 }  |  GET /log

import http from "http";

const TX_HASH   = "0xf4b2e8c9d1a3e5f7b9c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f2a4b6c8d0e2f4b6";
const TX_BLOCK  = 29130624;   // 0x1BA8F80
const USDT_ADDR = "0x55d398326f99059ff775485246999027b3197955";
const RECIPIENT = "0xabcdef1234567890abcdef1234567890abcdef12";
const SENDER    = "0xc0ffee254729296a45a3885639ac7e10f9d54979";

// 100 USDT × 10^18 = 100 000 000 000 000 000 000 = 0x56BC75E2D63100000
const AMOUNT_DATA =
  "0x0000000000000000000000000000000000000000000000056bc75e2d63100000";

const mockTx = {
  hash:        TX_HASH,
  blockHash:   "0x8badf00d8badf00d8badf00d8badf00d8badf00d8badf00d8badf00d8badf00d",
  blockNumber: "0x" + TX_BLOCK.toString(16),
  from:        SENDER,
  to:          USDT_ADDR,
  value:       "0x0",
  input:
    "0xa9059cbb" +
    "000000000000000000000000abcdef1234567890abcdef1234567890abcdef12" +
    "0000000000000000000000000000000000000000000000056bc75e2d63100000",
};

const mockReceipt = {
  transactionHash: TX_HASH,
  blockNumber:     "0x" + TX_BLOCK.toString(16),
  status:          "0x1",
  from:            SENDER,
  to:              USDT_ADDR,
  logs: [
    {
      address: USDT_ADDR,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x000000000000000000000000c0ffee254729296a45a3885639ac7e10f9d54979",
        "0x000000000000000000000000abcdef1234567890abcdef1234567890abcdef12",
      ],
      data:            AMOUNT_DATA,
      transactionHash: TX_HASH,
      blockNumber:     "0x" + TX_BLOCK.toString(16),
      logIndex:        "0x0",
    },
  ],
};

let phase   = 1;
const calls = [];

const blockByPhase = {
  1: TX_BLOCK + 2,   // currentBlock → 3 confirmations
  2: TX_BLOCK + 13,  // currentBlock → 14 confirmations
};

const server = http.createServer((req, res) => {
  // Phase control
  if (req.method === "POST" && req.url === "/control") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try { phase = JSON.parse(body).phase ?? phase; } catch {}
      const confs = blockByPhase[phase] - TX_BLOCK + 1;
      process.stderr.write(
        `[mock-bsc] phase → ${phase} (${confs} confirmations)\n`,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, phase, confirmations: confs }));
    });
    return;
  }

  // Call log
  if (req.url === "/log") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(calls));
    return;
  }

  // JSON-RPC handler
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let rpc;
    try { rpc = JSON.parse(body); } catch {
      res.writeHead(400); res.end(); return;
    }

    const { method, id } = rpc;
    const currentBlock   = blockByPhase[phase] ?? blockByPhase[1];

    let result;
    if      (method === "eth_chainId")                    result = "0x38";
    else if (method === "eth_getTransactionByHash")       result = mockTx;
    else if (method === "eth_getTransactionReceipt")      result = mockReceipt;
    else if (method === "eth_blockNumber")                result = "0x" + currentBlock.toString(16);
    else                                                  result = null;

    const confs = method === "eth_blockNumber"
      ? currentBlock - TX_BLOCK + 1
      : undefined;

    calls.push({ ts: new Date().toISOString(), phase, method, confirmations: confs });
    process.stderr.write(
      `[mock-bsc] ${method}${confs !== undefined ? ` → ${confs} confs` : ""}\n`,
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  });
});

server.listen(9998, "127.0.0.1", () =>
  process.stderr.write("[mock-bsc] Listening on 127.0.0.1:9998\n"),
);
