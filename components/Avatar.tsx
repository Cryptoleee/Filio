import { initials, nameColor } from '@/lib/data';

export default function Avatar({
  name,
  size,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const sizeStyle = size
    ? { width: size, height: size, fontSize: Math.round(size * 0.37) }
    : undefined;
  return (
    <div
      className={`avatar ${className}`}
      style={{ background: nameColor(name), ...sizeStyle, ...style }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
