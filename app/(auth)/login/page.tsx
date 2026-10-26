import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-illustration" aria-label="绿色建筑审核">
        <div className="login-illustration-content">
          <h1>
            让每一项绿色建筑审核
            <br />
            都有据可查
          </h1>
          <p>专业、可追溯的认证预审协作平台</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <Image
            className="brand-logo-full"
            src="/images/certiscope-logo.png"
            alt="CertiScope"
            width={260}
            height={155}
            priority
          />
          <h2>欢迎登录</h2>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
