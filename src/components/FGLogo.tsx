export default function FGLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="100" height="100" rx="10" fill="#0a0a0a"/>

      {/*
        Green "f" hook — closed filled path tracing the stroke outline.
        Starts at foot bottom-left, goes up the straight left side,
        sweeps up-right for the arm, comes back via the inner concave,
        down the inner stem, then curves right for the foot.
      */}
      <path
        fill="#3CB33D"
        d={[
          'M16,80',
          'L16,26',                    // straight left side going up
          'Q16,6 44,8',               // outer arc sweeping up and right
          'Q64,8 66,14',              // arm continuing right to tip
          'C66,26 46,46 38,52',       // inner concave sweeping back down-left
          'L38,68',                    // inner stem going down
          'Q38,80 47,80',             // inner foot curving right
          'Q30,83 16,80',             // outer foot curving back left
          'Z',
        ].join(' ')}
      />

      {/*
        White "G" bracket — rectangle with a square notch cut from the
        upper-left (the concave of the f becomes the notch of the G),
        and a slightly rounded bottom-left corner.
      */}
      <path
        fill="white"
        d="M42,52 L42,78 Q42,82 46,82 L72,82 L72,20 L57,20 L57,52 Z"
      />

      {/* Green dot centred in the lower white area */}
      <circle cx="57" cy="64" r="9" fill="#3CB33D"/>
    </svg>
  );
}
