import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon, MaximizeIcon, MinusIcon } from "./icons";
import "./TitleBar.css";

function withWindow(action: (window: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void action(getCurrentWindow()).catch(() => undefined);
}

export default function TitleBar() {
  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="desktop-titlebar__brand" data-tauri-drag-region>
        <span className="desktop-titlebar__mark">CS</span>
        <div><strong>CS2 赛事模拟器</strong><span>TOURNAMENT OPERATIONS · LOCAL DATABASE</span></div>
      </div>
      <div className="desktop-titlebar__controls">
        <button aria-label="最小化" onClick={() => withWindow((appWindow) => appWindow.minimize())}><MinusIcon size={16} /></button>
        <button aria-label="最大化或还原" onClick={() => withWindow((appWindow) => appWindow.toggleMaximize())}><MaximizeIcon size={13} /></button>
        <button className="is-close" aria-label="关闭" onClick={() => withWindow((appWindow) => appWindow.close())}><CloseIcon size={16} /></button>
      </div>
    </header>
  );
}
