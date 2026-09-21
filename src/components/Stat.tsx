export function Stat({
  label,
  value,
  foot,
  alert = false,
}: {
  label: string;
  value: string | number;
  foot?: string;
  alert?: boolean;
}) {
  return (
    <div className={`card stat${alert ? ' alert' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}
