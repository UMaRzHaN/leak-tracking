export default function EditTextField({ label, value, onChange }) {
  return (
    <div className="field">
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
      />
      <label>{label}</label>
    </div>
  );
}
