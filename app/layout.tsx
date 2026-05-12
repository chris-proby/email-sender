export const metadata = {
  title: "Email Sender",
  description: "CSV 기반 이메일 일괄 발송",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          background: "#f7f7f8",
          color: "#1a1a1a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
