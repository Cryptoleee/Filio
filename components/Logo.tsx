export default function Logo({ size = 26 }: { size?: number }) {
  return <div className="logoSq" style={{ width: size, height: size }} />;
}
