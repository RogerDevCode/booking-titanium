import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/nn-01-booking-gateway`;

describe('NN_01_Booking_Gateway', () => {
  const TIMEOUT = 30000;

  // Note: This workflow requires manual "Publish" in n8n UI to register webhooks
  // See: https://github.com/n8n-io/n8n/issues/551
  // Tests below validate the workflow structure and orchestration logic

  // Structure tests
  it('Structure: workflow has correct node count', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    expect(workflow.nodes.length).toBe(14);
  }, TIMEOUT);

  it('Structure: workflow uses responseNode mode', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const webhookNode = workflow.nodes.find(n => n.name === 'Webhook');
    expect(webhookNode.parameters.responseMode).toBe('responseNode');
  }, TIMEOUT);

  it('Structure: workflow calls NN_02_Message_Parser', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const nn02Node = workflow.nodes.find(n => n.name === 'Parse Incoming Payload (NN_02)');
    expect(nn02Node.type).toBe('n8n-nodes-base.executeWorkflow');
    expect(nn02Node.parameters.workflowId.value).toBe('f80XLogu45Zg1TSM');
  }, TIMEOUT);

  it('Structure: workflow calls NN_03-B_Pipeline_Agent', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const nn03bNode = workflow.nodes.find(n => n.name === 'Execute Pipeline Agent (NN_03-B)');
    expect(nn03bNode.type).toBe('n8n-nodes-base.executeWorkflow');
    expect(nn03bNode.parameters.workflowId.value).toBe('X3D2dWkBu8QLlNSm');
  }, TIMEOUT);

  it('Structure: workflow calls NN_04_Telegram_Sender', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const nn04Node = workflow.nodes.find(n => n.name === 'Send Telegram Response (NN_04)');
    expect(nn04Node.type).toBe('n8n-nodes-base.executeWorkflow');
    expect(nn04Node.parameters.workflowId.value).toBe('WE7DxLKAECtsA8Up');
  }, TIMEOUT);

  it('Structure: workflow uses Gate+Skip pattern (no IF nodes)', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const ifNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.if');
    expect(ifNodes.length).toBe(0); // No IF nodes - uses Gate+Skip instead
  }, TIMEOUT);

  it('Structure: workflow has Final Response node with Standard Contract', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const finalResponseNode = workflow.nodes.find(n => n.name === 'Final Response');
    expect(finalResponseNode).toBeDefined();
    expect(finalResponseNode.parameters.jsCode).toContain('success:');
    expect(finalResponseNode.parameters.jsCode).toContain('error_code:');
    expect(finalResponseNode.parameters.jsCode).toContain('_meta:');
  }, TIMEOUT);

  it('Structure: workflow has Respond to Webhook node', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const respondNode = workflow.nodes.find(n => n.name === 'Respond to Webhook');
    expect(respondNode).toBeDefined();
    expect(respondNode.type).toBe('n8n-nodes-base.respondToWebhook');
  }, TIMEOUT);

  it('Structure: workflow has error handling for Telegram', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const errorFormatNode = workflow.nodes.find(n => n.name === 'Format Telegram Error');
    expect(errorFormatNode).toBeDefined();
    expect(errorFormatNode.parameters.jsCode).toContain('chat_id');
    expect(errorFormatNode.parameters.jsCode).toContain('Error del asistente');
  }, TIMEOUT);

  it('Structure: connections are properly wired', async () => {
    const workflow = await import('../workflows/NN_01_Booking_Gateway.json');
    const connections = workflow.connections;
    
    // Webhook should connect to Parse Incoming Payload
    expect(connections['Webhook'].main[0][0].node).toBe('Parse Incoming Payload (NN_02)');
    
    // Parse should connect to both Gate Parser OK and Gate Parser Error
    const parseConnections = connections['Parse Incoming Payload (NN_02)'].main[0];
    expect(parseConnections.length).toBe(2);
    expect(parseConnections.map(c => c.node)).toContain('Gate Parser OK');
    expect(parseConnections.map(c => c.node)).toContain('Gate Parser Error');
  }, TIMEOUT);

});
