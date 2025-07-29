const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Image optimization script using Sharp
 * Converts images to WebP format and optimizes for web use
 */

const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'];
const WEBP_QUALITY = 80;
const WEBP_EFFORT = 6; // 0-6, higher means slower but better compression

async function findImages(dir) {
  const images = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and other ignored directories
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        images.push(...await findImages(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_FORMATS.includes(ext)) {
          images.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.warn(`Could not read directory ${dir}:`, error.message);
  }
  
  return images;
}

async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return { size: stats.size, exists: true };
  } catch {
    return { size: 0, exists: false };
  }
}

async function optimizeImage(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const dir = path.dirname(inputPath);
  const name = path.basename(inputPath, ext);
  const webpPath = path.join(dir, `${name}.webp`);
  
  try {
    // Get original file size
    const originalStats = await getFileStats(inputPath);
    if (!originalStats.exists) {
      console.warn(`⚠️  File not found: ${inputPath}`);
      return null;
    }

    // Check if WebP already exists and is newer
    const webpStats = await getFileStats(webpPath);
    if (webpStats.exists) {
      const originalTime = (await fs.stat(inputPath)).mtime;
      const webpTime = (await fs.stat(webpPath)).mtime;
      
      if (webpTime > originalTime) {
        console.log(`⏭️  Skipping ${inputPath} (WebP is up to date)`);
        return {
          input: inputPath,
          output: webpPath,
          originalSize: originalStats.size,
          optimizedSize: webpStats.size,
          savings: ((originalStats.size - webpStats.size) / originalStats.size * 100).toFixed(1),
          skipped: true
        };
      }
    }

    // Convert to WebP
    const info = await sharp(inputPath)
      .webp({
        quality: WEBP_QUALITY,
        effort: WEBP_EFFORT,
        lossless: false
      })
      .toFile(webpPath);

    const newStats = await getFileStats(webpPath);
    const savings = ((originalStats.size - newStats.size) / originalStats.size * 100).toFixed(1);

    console.log(`✅ Optimized: ${path.relative(process.cwd(), inputPath)}`);
    console.log(`   Original: ${(originalStats.size / 1024).toFixed(1)} KB`);
    console.log(`   WebP: ${(newStats.size / 1024).toFixed(1)} KB`);
    console.log(`   Savings: ${savings}%`);

    return {
      input: inputPath,
      output: webpPath,
      originalSize: originalStats.size,
      optimizedSize: newStats.size,
      savings,
      skipped: false
    };
  } catch (error) {
    console.error(`❌ Failed to optimize ${inputPath}:`, error.message);
    return null;
  }
}

async function generateOptimizationReport(results) {
  const successful = results.filter(r => r !== null);
  const processed = successful.filter(r => !r.skipped);
  const skipped = successful.filter(r => r.skipped);

  const totalOriginalSize = successful.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimizedSize = successful.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalSavings = totalOriginalSize > 0 
    ? ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize * 100).toFixed(1)
    : 0;

  const report = `
# Image Optimization Report

## Summary
- **Total images found**: ${results.length}
- **Successfully processed**: ${processed.length}
- **Skipped (up to date)**: ${skipped.length}
- **Failed**: ${results.filter(r => r === null).length}

## Size Reduction
- **Original total size**: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB
- **Optimized total size**: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB
- **Total savings**: ${totalSavings}%
- **Bytes saved**: ${(totalOriginalSize - totalOptimizedSize).toLocaleString()} bytes

## Processed Files
${processed.map(r => `- ${path.relative(process.cwd(), r.input)} → ${path.relative(process.cwd(), r.output)} (${r.savings}% savings)`).join('\n')}

${skipped.length > 0 ? `
## Skipped Files (Up to Date)
${skipped.map(r => `- ${path.relative(process.cwd(), r.input)} (${r.savings}% savings)`).join('\n')}
` : ''}

---
Generated on ${new Date().toISOString()}
`;

  await fs.writeFile('image-optimization-report.md', report);
  console.log('\n📊 Report saved to image-optimization-report.md');
}

async function main() {
  console.log('🖼️  Starting image optimization...\n');
  
  const startTime = Date.now();
  
  // Find all images in the project
  const images = await findImages(process.cwd());
  console.log(`Found ${images.length} images to process\n`);
  
  if (images.length === 0) {
    console.log('No images found to optimize.');
    return;
  }

  // Process images with concurrency limit
  const CONCURRENT_LIMIT = 3;
  const results = [];
  
  for (let i = 0; i < images.length; i += CONCURRENT_LIMIT) {
    const batch = images.slice(i, i + CONCURRENT_LIMIT);
    const batchResults = await Promise.all(
      batch.map(image => optimizeImage(image))
    );
    results.push(...batchResults);
    
    // Progress indicator
    const progress = Math.min(i + CONCURRENT_LIMIT, images.length);
    console.log(`\n📈 Progress: ${progress}/${images.length} images processed\n`);
  }

  // Generate report
  await generateOptimizationReport(results);
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log(`\n🎉 Image optimization completed in ${duration} seconds!`);
}

// Run the optimization
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Image optimization failed:', error);
    process.exit(1);
  });
}

module.exports = { optimizeImage, findImages };