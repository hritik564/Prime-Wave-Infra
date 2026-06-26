---
name: Framer Motion inside ReactFlow nodes
description: Using motion.* components as ReactFlow custom node types causes silent non-Error Promise rejections ("not an error object" crash) in Framer Motion v12 + @xyflow/react v12.
---

## Rule

Never use `motion.div` (or any `motion.*` element) as the root element of a React Flow custom node component.

**Why:** Framer Motion v12 changed its animation engine. React Flow v12 wraps each custom node in a `NodeWrapper` that uses `ResizeObserver` to measure node dimensions. When the `ResizeObserver` fires (triggering a re-render) while a Framer Motion animation is in flight, Framer Motion v12 cancels the in-progress animation. The cancellation creates an unhandled Promise rejection with a non-Error value (`null` or `undefined`), which browsers report as "An uncaught exception occurred but the error was not an error object."

**How to apply:** In any `nodeTypes` component (e.g. `RootNode`, `MemberNode`, `EmptySlotNode`), use a plain `<div>` with inline CSS transitions instead of `<motion.div>`:

```tsx
// BAD — causes non-Error crash with @xyflow/react v12 + framer-motion v12
function MemberNode({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: data.faded ? 0.18 : 1, scale: 1 }}
      transition={{ duration: 0.3 }}>
      ...
    </motion.div>
  );
}

// GOOD — CSS transition, no Promises, no crash
function MemberNode({ data }) {
  return (
    <div style={{
      opacity: data.faded ? 0.18 : 1,
      transition: "opacity 0.18s ease",
    }}>
      ...
    </div>
  );
}
```

Framer Motion is safe to use OUTSIDE of ReactFlow (page-level `motion.div`, `AnimatePresence`, drawer overlays, etc.) — the conflict is specific to components registered as `nodeTypes`.

Also: add `colorMode="dark"` to `<ReactFlow>` when the app uses a dark theme to prevent React Flow's default light-mode CSS class from conflicting with the app's CSS variables.
