// ⚠️ THIS ENTIRE PAGE IS A PLACEHOLDER. DELETE ALL OF THIS CODE AND REPLACE IT WITH THE USER'S APP.
// Do NOT preserve any part of this file — not the layout, not the styling, not the structure.
// Do NOT use this page as a starting point or reference. Start from scratch based on what the user asks for.
// When you build the real page, remove these comments entirely.

const Index = () => {
  return (
    // Placeholder Content, needs to be fully replaced with the user's content.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/3 right-1/4 h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
      </div>
      <div className="relative z-10 text-center px-6 max-w-3xl">
        <h1
          className="font-syne text-2xl sm:text-3xl md:text-4xl font-bold leading-normal whitespace-nowrap animate-shimmer-sweep"
          style={{
            background: "linear-gradient(90deg, hsl(var(--foreground)) 0%, hsl(var(--foreground)) 35%, hsl(var(--primary)) 45%, hsl(var(--accent)) 55%, hsl(var(--foreground)) 65%, hsl(var(--foreground)) 100%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Welcome to vibecode.dev
        </h1>
        <p className="mt-8 text-base sm:text-lg text-muted-foreground leading-relaxed">
          Share your idea with Claude Code and see it come to life.
        </p>
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
};

export default Index;
