import { useEffect } from "react";
import logo from '@/assets/logo.png';

export default function PageLoader() {
  useEffect(() => {
    document.getElementById("static-loader")?.remove();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6">
      {/* Logo avec effet pulse + ring animé */}
      <div className="relative">
        {/* Ring extérieur */}
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            boxShadow: '0 0 0 0 rgba(var(--primary-rgb, 99,102,241), 0.4)',
            animation: 'loader-ring 1.8s ease-out infinite',
          }}
        />
        {/* Logo */}
        <img
          src={logo}
          alt="Scouty"
          className="w-20 h-20 rounded-3xl shadow-2xl shadow-primary/30"
          style={{ animation: 'loader-logo 1.8s ease-in-out infinite' }}
        />
      </div>

      {/* Nom de l'app */}
      <div className="text-center space-y-1">
        <p
          className="text-2xl font-black tracking-tight text-foreground"
          style={{ animation: 'loader-fade 1.8s ease-in-out infinite' }}
        >
          Scouty
        </p>
        {/* Barre de chargement */}
        <div className="w-32 h-1 rounded-full bg-muted overflow-hidden mx-auto">
          <div
            className="h-full rounded-full bg-primary"
            style={{ animation: 'loader-bar 1.4s ease-in-out infinite' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes loader-ring {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.45); }
          70%  { box-shadow: 0 0 0 18px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }
        @keyframes loader-logo {
          0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 0px rgba(99,102,241,0)); }
          50%       { transform: scale(1.06); filter: drop-shadow(0 0 12px rgba(99,102,241,0.5)); }
        }
        @keyframes loader-fade {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes loader-bar {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
