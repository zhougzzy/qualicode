export function getServerConfig() {
  return {
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
    accessCode: process.env.QUALICODE_ACCESS_CODE ?? "",
  };
}
