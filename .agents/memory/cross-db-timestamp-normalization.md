---
name: Cross-database timestamp normalization
description: Netcup and Replit sessions can use different time zones when timestamp-without-time-zone values are produced.
---

Normalize comparison boundaries and migration timestamps to UTC before classifying live deltas.

**Why:** The Netcup session used Europe/Berlin while Replit Production used GMT, so the same application event appeared one hour apart in timestamp-without-time-zone columns; raw textual timestamps create false differences.

**How to apply:** Record each connection's `current_setting('TimeZone')`, convert the snapshot boundary and timestamp values to one common zone, and compare normalized instants rather than displayed strings.