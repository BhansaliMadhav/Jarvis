interface PageProps {
  params: {
    fileid: string;
  };
}
const Page = ({ params }: PageProps) => {
  const fileid = params.fileid;
  return <div>File</div>;
};
export default Page;
