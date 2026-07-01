import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: 'ShieldPass Docs',
  description: 'Documentation for ShieldPass V2'
}

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const pageMap = await getPageMap()

  return (
    <Layout
      banner={<Banner storageKey="shieldpass-banner"><span className="banner-typing">ShieldPass V2 is here!</span></Banner>}
      navbar={<Navbar logo={<span />} projectLink={null} />}
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/ShieldPass/shieldpass/tree/main/docs-site"
      footer={<Footer>MIT {new Date().getFullYear()} © ShieldPass.</Footer>}
    >

      {children}
    </Layout>
  )
}
