#!/usr/bin/env node

/**
 * Script de test pour vérifier la connexion à l'API Laravel
 * Usage: npm run build && node dist/test.js
 */

import dotenv from 'dotenv';
import { NinjalinkingApiClient } from './api-client.js';

dotenv.config();

const API_URL = process.env.GOUDO_API_URL;
const API_TOKEN = process.env.GOUDO_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.error('❌ Missing GOUDO_API_URL or GOUDO_API_TOKEN in .env');
  process.exit(1);
}

async function test() {
  console.log('🧪 Testing Ninjalinking API Connection...\n');
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`🔑 Token: ${API_TOKEN!.substring(0, 10)}...\n`);

  const client = new NinjalinkingApiClient(API_URL!, API_TOKEN!);

  // Test 1: Get pending orders
  console.log('📦 Test 1: Fetching pending orders...');
  const ordersResult = await client.getPendingOrders();
  if (ordersResult.error) {
    console.error('❌ Error:', ordersResult.error);
  } else {
    console.log('✅ Success! Found', ordersResult.data?.length || 0, 'orders');
    if (ordersResult.data && ordersResult.data.length > 0) {
      console.log('   First order:', JSON.stringify(ordersResult.data[0], null, 2));
    }
  }
  console.log('');

  // Test 2: Get pending links
  console.log('🔗 Test 2: Fetching pending links...');
  const linksResult = await client.getPendingLinks();
  if (linksResult.error) {
    console.error('❌ Error:', linksResult.error);
  } else {
    console.log('✅ Success! Found', linksResult.data?.length || 0, 'links');
    if (linksResult.data && linksResult.data.length > 0) {
      console.log('   First link:', JSON.stringify(linksResult.data[0], null, 2));
    }
  }
  console.log('');

  // Test 3: Get order details (if we have an order)
  if (ordersResult.data && ordersResult.data.length > 0) {
    const firstOrderId = ordersResult.data[0].id;
    console.log(`📋 Test 3: Fetching order details for order #${firstOrderId}...`);
    const detailsResult = await client.getOrderDetails(firstOrderId);
    if (detailsResult.error) {
      console.error('❌ Error:', detailsResult.error);
    } else {
      console.log('✅ Success!');
      console.log('   Order details:', JSON.stringify(detailsResult.data, null, 2));
    }
  }

  console.log('\n✨ Tests completed!');
}

test().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
