import logoImage from "@/assets/primewave-logo.png";
import iconImage from "@/assets/primewave-icon.png";

interface PrimeWaveLogoProps {
  className?: string;
}

export function PrimeWaveLogo({ className = "" }: PrimeWaveLogoProps) {
  return (
    <span className={`pw-logo ${className}`.trim()} role="img" aria-label="PrimeWave">
      <img className="pw-logo-image pw-logo-horizontal" src={logoImage} alt="" />
      <img className="pw-logo-image pw-logo-icon" src={iconImage} alt="" />
    </span>
  );
}