-- A product can be a virtual private server.
ALTER TYPE "ProductFulfilment" ADD VALUE IF NOT EXISTS 'VPS';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'VPS';
