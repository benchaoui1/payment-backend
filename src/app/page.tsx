import { ROOT_MESSAGE } from "@/lib/service";

export default function Home() {
  return (
    <main
      style={{
        alignItems: "center",
        display: "flex",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
      }}
    >
      <h1
        style={{
          fontSize: "20px",
          fontWeight: 600,
          lineHeight: 1.4,
          margin: 0,
          textAlign: "center",
        }}
      >
        {ROOT_MESSAGE}
      </h1>
    </main>
  );
}
