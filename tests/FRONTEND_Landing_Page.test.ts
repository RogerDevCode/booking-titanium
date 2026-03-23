import * as fs from 'fs';
import * as path from 'path';

describe('FRONTEND_Landing_Page Paranoia Tests', () => {
  const TIMEOUT = 15000;
  const WORKFLOW_PATH = path.join(__dirname, '../workflows/FRONTEND_Landing_Page.json');

  let workflow: any;

  beforeAll(() => {
    workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'));
  });

  // === ARCHITECTURE TESTS ===

  it('has correct workflow structure (3 nodes)', () => {
    expect(workflow.nodes).toHaveLength(3);
    const nodeNames = workflow.nodes.map((n: any) => n.name);
    expect(nodeNames).toContain('Webhook');
    expect(nodeNames).toContain('Generate Frontend');
    expect(nodeNames).toContain('Respond to Webhook');
  }, TIMEOUT);

  it('uses correct node versions', () => {
    const webhook = workflow.nodes.find((n: any) => n.name === 'Webhook');
    const code = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const respond = workflow.nodes.find((n: any) => n.name === 'Respond to Webhook');

    expect(webhook.typeVersion).toBe(2.1);
    expect(code.typeVersion).toBe(2);
    expect(respond.typeVersion).toBeGreaterThanOrEqual(1.1);
  }, TIMEOUT);

  it('has correct webhook configuration (GET method)', () => {
    const webhook = workflow.nodes.find((n: any) => n.name === 'Webhook');
    expect(webhook.parameters.httpMethod).toBe('GET');
    expect(webhook.parameters.path).toBe('titanium-landing');
    expect(webhook.parameters.responseMode).toBe('responseNode');
  }, TIMEOUT);

  // === CONTENT TESTS ===

  it('generates valid HTML structure', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('<!DOCTYPE html>');
    expect(jsCode).toContain('<html');
    expect(jsCode).toContain('</html>');
  }, TIMEOUT);

  it('includes Booking Titanium branding', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('Booking Titanium');
    expect(jsCode).toContain('Titanium');
  }, TIMEOUT);

  it('includes Telegram CTA link', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('t.me/');
    expect(jsCode).toContain('Telegram');
  }, TIMEOUT);

  // === SECURITY TESTS ===

  it('uses responseNode mode (not lastNode)', () => {
    const webhook = workflow.nodes.find((n: any) => n.name === 'Webhook');
    expect(webhook.parameters.responseMode).toBe('responseNode');
  }, TIMEOUT);

  it('sets correct Content-Type header', () => {
    const respondNode = workflow.nodes.find((n: any) => n.name === 'Respond to Webhook');
    const headers = respondNode.parameters.options?.responseHeaders?.entries;
    
    const contentTypeHeader = headers?.find((h: any) => h.name === 'Content-Type');
    expect(contentTypeHeader).toBeDefined();
    expect(contentTypeHeader?.value).toBe('text/html');
  }, TIMEOUT);

  // === DESIGN TESTS ===

  it('includes modern CSS features', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('cursor-glow'); // Interactive cursor effect
    expect(jsCode).toContain('ambient-bg'); // Ambient background
    expect(jsCode).toContain('animation'); // CSS animations
    expect(jsCode).toContain('backdrop-filter'); // Glassmorphism
    expect(jsCode).toContain('radial-gradient');
  }, TIMEOUT);

  it('includes responsive design', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('@media (max-width: 768px)');
    expect(jsCode).toContain('viewport');
  }, TIMEOUT);

  it('includes Google Fonts', () => {
    const generateNode = workflow.nodes.find((n: any) => n.name === 'Generate Frontend');
    const jsCode = generateNode.parameters.jsCode;

    expect(jsCode).toContain('fonts.googleapis.com');
    expect(jsCode).toContain('Outfit');
    expect(jsCode).toContain('Manrope');
  }, TIMEOUT);

});
