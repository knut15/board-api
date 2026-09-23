// 레이어: app (라우팅 껍데기) — 화면은 presentation 이 그린다.
import { PostList } from "@/presentation/components/PostList";

export default function HomePage() {
  return <PostList />;
}
