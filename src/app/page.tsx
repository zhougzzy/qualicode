"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UploadPanel } from "@/components/UploadPanel";
import { savePendingUploads } from "@/lib/session-storage";

export default function HomePage() {
  const router = useRouter();
  const [uploadError, setUploadError] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessState, setAccessState] = useState<"loading" | "open" | "required">("loading");

  useEffect(() => {
    fetch("/api/access/status", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ data?: { configured?: boolean; authorized?: boolean } }>)
      .then((result) => setAccessState(result.data?.configured && !result.data.authorized ? "required" : "open"))
      .catch(() => setAccessState("open"));
  }, []);

  const verifyAccessCode = async () => {
    setAccessMessage("");
    try {
      const response = await fetch("/api/access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode }),
      });
      const result = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) {
        setAccessMessage(result.error?.message ?? "访问码不正确。");
        return;
      }
      setAccessCode("");
      setAccessMessage("");
      setAccessState("open");
    } catch {
      setAccessMessage("无法连接访问验证服务，请稍后重试。");
    }
  };

  return (
    <main className="landing-page">
      <header className="landing-topbar">
        <Link className="brand-lockup" href="/" aria-label="QualiCode 首页">
          <span className="brand-mark">Q</span>
          <span>QualiCode</span>
        </Link>
        <span className="topbar-note">心理学访谈 · 扎根理论辅助</span>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">QUALITATIVE RESEARCH / 01</p>
          <h1>让访谈材料<br /><em>变得可读、可证。</em></h1>
          <p className="hero-lede">
            QualiCode 帮你把访谈文件转成可核对的文本，再用 AI 辅助发现开放编码。原文始终保留，研究判断始终由你确认。
          </p>
          {accessState === "loading" && <p className="access-loading">正在检查访问权限…</p>}
          {accessState === "required" && (
            <div className="access-gate" aria-label="共享访问码">
              <label htmlFor="access-code">请输入共享访问码</label>
              <div className="access-gate-row">
                <input id="access-code" type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void verifyAccessCode(); }} />
                <button className="button button-primary" onClick={() => void verifyAccessCode()} disabled={!accessCode.trim()}>进入</button>
              </div>
              {accessMessage && <p className="hero-upload-error" role="alert">{accessMessage}</p>}
            </div>
          )}
          {accessState === "open" && <UploadPanel
              multiple
              className="hero-upload-panel"
              title="上传访谈文件"
              onConverted={(results) => {
                setUploadError("");
                if (savePendingUploads(results)) router.push("/workspace");
                else setUploadError("当前标签页无法暂存文件，请检查浏览器存储权限后重试。");
              }}
              onError={setUploadError}
            />}
          {uploadError && <p className="hero-upload-error" role="alert">{uploadError}</p>}
          <p className="hero-footnote">支持 .docx 与文字型 .pdf · 文件不会被长期保存 · AI 分析会将文本发送至 DeepSeek</p>
        </div>

        <div className="hero-visual" aria-label="QualiCode 分析流程示意">
          <div className="visual-caption">从材料到洞见</div>
          <div className="visual-paper">
            <div className="paper-topline"><span>INTERVIEW_014</span><span>TEXT / 01</span></div>
            <div className="paper-question">“那段时间我经常先答应下来，后来才发现自己很累。”</div>
            <div className="paper-lines">
              <span className="line long" /><span className="line medium" /><span className="line short" />
            </div>
            <div className="paper-tag"><span className="tag-dot" />边界表达困难</div>
          </div>
          <div className="visual-stamp">原文<br />优先</div>
        </div>
      </section>

      <section className="landing-process" aria-label="使用流程">
        <div className="process-intro">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>把复杂的第一步，<br />交给一个清晰的工作台。</h2>
        </div>
        <div className="process-steps">
          <div className="process-step"><span>01</span><strong>上传</strong><p>导入访谈文件</p></div>
          <div className="process-rule" />
          <div className="process-step"><span>02</span><strong>核对</strong><p>确认文本原文</p></div>
          <div className="process-rule" />
          <div className="process-step"><span>03</span><strong>分析</strong><p>获得开放编码建议</p></div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>QUALICODE / MVP</span>
        <span>研究者保留最终判断权</span>
      </footer>
    </main>
  );
}
