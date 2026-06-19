export default function FGLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="100" height="100" rx="14" fill="#0a0a0a"/>

      {/* Green F-hook: solid P-shape filling the left + bowl arc */}
      <path
        fill="#3AB83D"
        d="M20,82 L20,26 Q20,6 44,6 Q70,6 70,28 Q70,52 50,54 L36,54 L36,82 Z"
      />

      {/* Black punch-out to hollow the bowl */}
      <ellipse cx="46" cy="29" rx="17" ry="19" fill="#0a0a0a"/>

      {/* White G bracket — reversed-C with notch at upper-left */}
      <path
        fill="white"
        d="M44,54 L44,82 L74,82 L74,20 L58,20 L58,54 Z"
      />

      {/* Green dot inside the G */}
      <circle cx="63" cy="68" r="8" fill="#3AB83D"/>
    </svg>
  );
}
