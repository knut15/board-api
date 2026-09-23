import { Suspense } from "react";
import { LoginForm } from "@/presentation/components/LoginForm";

// useSearchParams 를 쓰는 컴포넌트는 Suspense 로 감싸야 한다.
// 정적으로 미리 그릴 때 주소의 쿼리를 알 수 없어서다.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
