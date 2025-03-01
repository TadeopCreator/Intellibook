export const getStaticUrl = (path: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.X.X:8000';
  return `${baseUrl}/static/${path}`;
}; 