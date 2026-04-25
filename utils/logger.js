export function logError(context, error) {
  console.error("\n================ BOT ERROR ================");
  console.error("📍 Context:", context);
  console.error("❌ Message:", error?.message || error);
  console.error("📄 Stack:", error?.stack || "No stack trace");
  console.error("==========================================\n");
}

export function logInfo(message) {
  console.log("ℹ️", message);
}