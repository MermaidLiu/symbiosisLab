import { ICP_BEIAN_NUMBER, ICP_BEIAN_URL } from "@/lib/beian";

/** 网站底部 ICP 备案号（法规要求悬挂） */
export function IcpBeianFooter() {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-2 pt-1">
      <a
        href={ICP_BEIAN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto rounded bg-white/70 px-2 py-0.5 text-[11px] leading-none text-lab-muted backdrop-blur-sm hover:text-thu hover:underline"
      >
        {ICP_BEIAN_NUMBER}
      </a>
    </footer>
  );
}
