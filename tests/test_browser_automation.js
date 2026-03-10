// Test de Browser Automation - N8N Server Check Completo
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Iniciando browser automation test completo...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // URLs to test
    const urls = [
      'https://n8n.stax.ink/',
      'https://n8n.stax.ink/signin',
      'https://n8n.stax.ink/workflow',
      'https://n8n.stax.ink/executions'
    ];
    
    for (const url of urls) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🌐 Probando: ${url}`);
      console.log('='.repeat(60));
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        
        const title = await page.title();
        console.log(`📄 Título: ${title}`);
        console.log(`📍 URL final: ${page.url()}`);
        
        // Check status
        const status = await page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title,
            hasLogin: !!document.querySelector('input[type="password"]'),
            hasEmail: !!document.querySelector('input[type="email"]'),
            hasWorkflow: !!document.querySelector('[data-test-id="workflows"]') || !!document.querySelector('.workflow'),
            bodyText: document.body.innerText.substring(0, 200)
          };
        });
        
        console.log(`🔐 Login form: ${status.hasLogin ? '✅ Detectado' : '❌ No detectado'}`);
        console.log(`📧 Email field: ${status.hasEmail ? '✅ Detectado' : '❌ No detectado'}`);
        console.log(`📊 Workflow UI: ${status.hasWorkflow ? '✅ Detectado' : '❌ No detectado'}`);
        console.log(`📝 Preview: ${status.bodyText || '(vacío)'}...`);
        
        // Screenshot
        const screenshotPath = `/home/manager/Sync/N8N Projects/booking-titanium/tests/n8n_${url.split('/').pop() || 'home'}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot: ${screenshotPath}`);
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    console.log('\n✅ Test completo finalizado!\n');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser cerrado');
    }
  }
})();
