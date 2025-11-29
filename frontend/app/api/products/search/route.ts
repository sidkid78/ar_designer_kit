// app/api/products/search/route.ts
// Product Search API Proxy - Secure affiliate integration

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// Product cache TTL (24 hours)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ProductSearchParams {
  query: string;
  category?: string;
  limit?: number;
  offset?: number;
}

interface CachedProduct {
  productId: string;
  partner: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  affiliateUrl: string;
  model3dUrl?: {
    glb?: string;
    usdz?: string;
  };
  cachedAt: Date;
  ttl: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!query && !category) {
      return NextResponse.json(
        { error: 'Query or category is required' },
        { status: 400 }
      );
    }

    // First, check cache
    const cacheKey = `${query}-${category}`.toLowerCase().replace(/\s+/g, '-');
    const cachedResults = await checkCache(cacheKey);
    
    if (cachedResults.length > 0) {
      return NextResponse.json({
        products: cachedResults.slice(offset, offset + limit),
        total: cachedResults.length,
        cached: true,
      });
    }

    // Fetch from partner APIs (mock implementation - replace with real API calls)
    const products = await fetchFromPartners({ query, category, limit, offset });

    // Cache the results
    await cacheProducts(cacheKey, products);

    return NextResponse.json({
      products: products.slice(offset, offset + limit),
      total: products.length,
      cached: false,
    });
  } catch (error) {
    console.error('Product search error:', error);
    return NextResponse.json(
      { error: 'Failed to search products' },
      { status: 500 }
    );
  }
}

async function checkCache(cacheKey: string): Promise<CachedProduct[]> {
  try {
    const cacheDoc = await db.collection('productCache').doc(cacheKey).get();
    
    if (!cacheDoc.exists) {
      return [];
    }

    const data = cacheDoc.data();
    if (!data) return [];

    const cachedAt = data.cachedAt?.toDate?.() || new Date(data.cachedAt);
    const age = Date.now() - cachedAt.getTime();

    if (age > CACHE_TTL_MS) {
      // Cache expired
      return [];
    }

    return data.products || [];
  } catch {
    return [];
  }
}

async function cacheProducts(cacheKey: string, products: CachedProduct[]): Promise<void> {
  try {
    await db.collection('productCache').doc(cacheKey).set({
      products,
      cachedAt: new Date(),
      ttl: CACHE_TTL_MS,
    });
  } catch (error) {
    console.error('Failed to cache products:', error);
  }
}

async function fetchFromPartners(params: ProductSearchParams): Promise<CachedProduct[]> {
  const products: CachedProduct[] = [];

  // Affiliate Partner Integration
  // TODO: Replace with actual partner API calls
  // Example partners: Wayfair, Home Depot, IKEA, etc.

  // Mock data for development
  const mockProducts: CachedProduct[] = [
    {
      productId: 'mock-sofa-001',
      partner: 'MockFurniture',
      name: 'Modern Velvet Sofa',
      description: 'A comfortable 3-seater sofa with velvet upholstery',
      price: 899.99,
      currency: 'USD',
      imageUrl: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Sofa',
      affiliateUrl: buildAffiliateUrl('mock-sofa-001', 'MockFurniture'),
      model3dUrl: {
        glb: 'https://example.com/models/sofa.glb',
        usdz: 'https://example.com/models/sofa.usdz',
      },
      cachedAt: new Date(),
      ttl: CACHE_TTL_MS,
    },
    {
      productId: 'mock-table-001',
      partner: 'MockFurniture',
      name: 'Minimalist Coffee Table',
      description: 'Sleek wooden coffee table with metal legs',
      price: 349.99,
      currency: 'USD',
      imageUrl: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Table',
      affiliateUrl: buildAffiliateUrl('mock-table-001', 'MockFurniture'),
      model3dUrl: {
        glb: 'https://example.com/models/table.glb',
        usdz: 'https://example.com/models/table.usdz',
      },
      cachedAt: new Date(),
      ttl: CACHE_TTL_MS,
    },
    {
      productId: 'mock-lamp-001',
      partner: 'MockFurniture',
      name: 'Arc Floor Lamp',
      description: 'Modern arc floor lamp with adjustable arm',
      price: 189.99,
      currency: 'USD',
      imageUrl: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Lamp',
      affiliateUrl: buildAffiliateUrl('mock-lamp-001', 'MockFurniture'),
      model3dUrl: {
        glb: 'https://example.com/models/lamp.glb',
        usdz: 'https://example.com/models/lamp.usdz',
      },
      cachedAt: new Date(),
      ttl: CACHE_TTL_MS,
    },
    {
      productId: 'mock-chair-001',
      partner: 'MockFurniture',
      name: 'Ergonomic Office Chair',
      description: 'Adjustable office chair with lumbar support',
      price: 449.99,
      currency: 'USD',
      imageUrl: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Chair',
      affiliateUrl: buildAffiliateUrl('mock-chair-001', 'MockFurniture'),
      model3dUrl: {
        glb: 'https://example.com/models/chair.glb',
        usdz: 'https://example.com/models/chair.usdz',
      },
      cachedAt: new Date(),
      ttl: CACHE_TTL_MS,
    },
  ];

  // Filter by query
  const query = params.query.toLowerCase();
  const filtered = mockProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      (params.category && p.name.toLowerCase().includes(params.category.toLowerCase()))
  );

  products.push(...(filtered.length > 0 ? filtered : mockProducts));

  return products;
}

function buildAffiliateUrl(productId: string, partner: string): string {
  // Build affiliate URL with tracking parameters
  const affiliateId = process.env.AFFILIATE_ID || 'AR_DESIGNER_KIT';
  
  // Example URL structure - replace with actual partner URL format
  return `https://www.${partner.toLowerCase()}.com/product/${productId}?ref=${affiliateId}&utm_source=ar_designer_kit&utm_medium=app`;
}

