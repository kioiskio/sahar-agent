export default function DubaiIllustration() {
  return <svg className="dubai-illustration" viewBox="0 0 1000 520" fill="none" role="img" aria-label="Illustrated Dubai skyline at dawn">
    <defs>
      <linearGradient id="skyline" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#346457"/><stop offset="1" stopColor="#173f35"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#4c7c6c"/><stop offset="1" stopColor="#1b483b"/></linearGradient>
    </defs>
    <path d="M0 471C240 438 495 492 1000 434V520H0V471Z" fill="#173f35"/>
    <g opacity=".45" fill="url(#skyline)">
      <path d="M13 449V304h50v145H13Zm8-145 17-36 16 36H21Z"/><path d="M70 449V341h67v108H70Zm5-67h58M75 369h58M75 396h58" stroke="#82a18f" strokeWidth="2"/>
      <path d="M156 449V273h70v176h-70Zm4-140h62M160 327h62M160 363h62M160 399h62" stroke="#82a18f" strokeWidth="2"/>
      <path d="M254 449V324h64v125h-64Zm73 0V250h58v199h-58Zm-68-91h54m-54 27h54m74-82h48m-48 36h48m-48 36h48m-48 36h48" stroke="#82a18f" strokeWidth="2"/>
      <path d="M623 449V300h57v149h-57Zm73 0V256h56v193h-56Zm-68 76h48m-48 32h48m73-94h46m-46 34h46m-46 34h46" stroke="#82a18f" strokeWidth="2"/>
      <path d="M786 449V331h55v118h-55Zm74 0V293h75v156h-75Zm-69 68h45m-45 30h45m75-92h65m-65 35h65m-65 35h65" stroke="#82a18f" strokeWidth="2"/>
    </g>
    <path d="M443 449 457 281 471 217 480 141 484 75 488 141 497 217 511 281 525 449H443Z" fill="url(#glass)" stroke="#173f35" strokeWidth="2"/>
    <path d="m463 449 6-182 15-103 15 103 6 182h-42Z" stroke="#85a18a" strokeWidth="1.5" opacity=".6"/>
    <path d="M484 77V26" stroke="#173f35" strokeWidth="2"/>
    <path d="M470 287h29m-33 36h37m-40 38h43m-46 43h49m-44-156h38m-35-34h31m-27-31h24" stroke="#b5c3a6" strokeWidth="1.5" opacity=".5"/>
    <path d="M382 450V370c0-15 17-23 30-23s29 8 29 23v80h-59Zm-10 0h81M389 378h44M389 395h44M389 412h44" stroke="#173f35" strokeWidth="2"/>
    <path d="M540 449V339c22-13 46-13 68 0v110h-68Zm0-84h68m-68 22h68m-68 22h68m-68 22h68" stroke="#173f35" strokeWidth="2"/>
    <path d="M0 451h1000" stroke="#173f35" strokeWidth="2"/>
    <path d="M85 466c195-21 347-11 475 6s255 9 408-13M130 485c170-11 291-1 387 11" stroke="#d1b995" strokeWidth="1.5" opacity=".55"/>
  </svg>;
}
