import { PostDetail } from "@/presentation/components/PostDetail";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail id={id} />;
}
