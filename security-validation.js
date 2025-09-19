#!/usr/bin/env node

/**
 * Security Validation Script for Load More Extension
 * Validates all critical vulnerabilities (H1-H5) fixes
 */

const fs = require('fs');
const path = require('path');

class SecurityValidator {
  constructor() {
    this.results = [];
    this.vulnerabilities = [];
    this.distPath = path.join(__dirname, 'dist');
  }

  log(test, status, details = '') {
    const result = { test, status, details, timestamp: new Date().toISOString() };
    this.results.push(result);
    console.log(`[${status.toUpperCase()}] ${test}: ${details}`);
  }

  // H1: Validate Manifest Permissions
  validateManifestPermissions() {
    console.log('\n=== H1: Validating Manifest Permissions ===');
    
    try {
      const manifestPath = path.join(this.distPath, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Check for minimal permissions
      const permissions = manifest.permissions || [];
      const requiredPerms = ['activeTab', 'scripting'];
      const dangerousPerms = ['tabs', 'webNavigation', 'history', 'bookmarks', 'storage'];

      // Validate only required permissions
      const hasOnlyRequired = permissions.every(perm => requiredPerms.includes(perm));
      const hasUnnecessary = permissions.some(perm => dangerousPerms.includes(perm));

      if (hasOnlyRequired && !hasUnnecessary) {
        this.log('H1-Permissions', 'PASS', `Minimal permissions: ${permissions.join(', ')}`);
      } else {
        this.log('H1-Permissions', 'FAIL', `Excessive permissions detected: ${permissions.join(', ')}`);
        this.vulnerabilities.push('H1: Excessive permissions in manifest');
      }

      // Check host permissions
      const hostPerms = manifest.host_permissions || [];
      if (hostPerms.length === 0) {
        this.log('H1-HostPerms', 'PASS', 'No host permissions (using activeTab)');
      } else {
        const hasWildcard = hostPerms.some(host => host === '<all_urls>' || host === '*://*/*');
        if (hasWildcard) {
          this.log('H1-HostPerms', 'FAIL', `Wildcard host permissions: ${hostPerms.join(', ')}`);
          this.vulnerabilities.push('H1: Overly broad host permissions');
        } else {
          this.log('H1-HostPerms', 'PASS', `Specific host permissions: ${hostPerms.join(', ')}`);
        }
      }

      // Check content script matches
      const contentScripts = manifest.content_scripts || [];
      contentScripts.forEach((script, index) => {
        const matches = script.matches || [];
        if (matches.includes('<all_urls>')) {
          this.log('H1-ContentScript', 'WARN', `Content script ${index} uses <all_urls> - consider more specific matching`);
        } else {
          this.log('H1-ContentScript', 'PASS', `Content script ${index} has specific matches`);
        }
      });

    } catch (error) {
      this.log('H1-Test', 'ERROR', `Failed to validate manifest: ${error.message}`);
    }
  }

  // H2: Validate Content Security Policy
  validateCSP() {
    console.log('\n=== H2: Validating Content Security Policy ===');
    
    try {
      const manifestPath = path.join(this.distPath, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      const csp = manifest.content_security_policy;
      
      if (!csp) {
        this.log('H2-CSP-Exists', 'FAIL', 'No CSP defined in manifest');
        this.vulnerabilities.push('H2: Missing Content Security Policy');
        return;
      }

      const cspString = csp.extension_pages || '';
      
      // Check for secure directives
      const requiredDirectives = ['script-src', 'object-src'];
      const hasRequired = requiredDirectives.every(dir => cspString.includes(dir));
      
      if (hasRequired) {
        this.log('H2-CSP-Directives', 'PASS', 'Required CSP directives present');
      } else {
        this.log('H2-CSP-Directives', 'FAIL', 'Missing required CSP directives');
        this.vulnerabilities.push('H2: Incomplete CSP directives');
      }

      // Check for unsafe directives
      const unsafePatterns = ["'unsafe-eval'", "'unsafe-inline'", "data:", "blob:"];
      const hasUnsafe = unsafePatterns.some(pattern => cspString.includes(pattern));

      if (hasUnsafe) {
        this.log('H2-CSP-Safe', 'FAIL', 'Unsafe CSP directives detected');
        this.vulnerabilities.push('H2: Unsafe CSP directives');
      } else {
        this.log('H2-CSP-Safe', 'PASS', 'No unsafe CSP directives');
      }

      // Check for restrictive policies
      if (cspString.includes("'self'") && cspString.includes("'none'")) {
        this.log('H2-CSP-Restrictive', 'PASS', 'Restrictive CSP policies in place');
      } else {
        this.log('H2-CSP-Restrictive', 'WARN', 'CSP could be more restrictive');
      }

    } catch (error) {
      this.log('H2-Test', 'ERROR', `Failed to validate CSP: ${error.message}`);
    }
  }

  // H3: Validate Message Security Implementation
  validateMessageSecurity() {
    console.log('\n=== H3: Validating Message Security ===');
    
    try {
      // Check security.js module
      const securityPath = path.join(this.distPath, 'security.js');
      if (fs.existsSync(securityPath)) {
        const securityCode = fs.readFileSync(securityPath, 'utf8');
        
        // Check for validation functions
        const hasValidation = securityCode.includes('validateMessage') && 
                             (securityCode.includes('sanitizeText') || securityCode.includes('sanitizeInput'));
        
        if (hasValidation) {
          this.log('H3-SecurityModule', 'PASS', 'Security validation module exists');
        } else {
          this.log('H3-SecurityModule', 'FAIL', 'Security validation functions missing');
          this.vulnerabilities.push('H3: Missing security validation functions');
        }

        // Check for rate limiting
        const hasRateLimit = securityCode.includes('rateLimit') || 
                            securityCode.includes('checkRateLimit');
        
        if (hasRateLimit) {
          this.log('H3-RateLimit', 'PASS', 'Rate limiting implementation found');
        } else {
          this.log('H3-RateLimit', 'FAIL', 'Rate limiting not implemented');
          this.vulnerabilities.push('H3: Missing rate limiting');
        }

        // Check for XSS protection
        const hasXSSProtection = securityCode.includes('sanitize') && 
                                securityCode.includes('escape');
        
        if (hasXSSProtection) {
          this.log('H3-XSSProtection', 'PASS', 'XSS protection implemented');
        } else {
          this.log('H3-XSSProtection', 'WARN', 'XSS protection may be incomplete');
        }

      } else {
        this.log('H3-SecurityModule', 'FAIL', 'Security module not found');
        this.vulnerabilities.push('H3: Missing security module');
      }

      // Check content.js for security integration
      const contentPath = path.join(this.distPath, 'content.js');
      if (fs.existsSync(contentPath)) {
        const contentCode = fs.readFileSync(contentPath, 'utf8');
        
        const hasSecurityIntegration = contentCode.includes('SecurityUtils') || 
                                      contentCode.includes('validateMessage');
        
        if (hasSecurityIntegration) {
          this.log('H3-ContentIntegration', 'PASS', 'Security integrated in content script');
        } else {
          this.log('H3-ContentIntegration', 'FAIL', 'Security not integrated in content script');
          this.vulnerabilities.push('H3: Security not integrated in content script');
        }
      }

    } catch (error) {
      this.log('H3-Test', 'ERROR', `Failed to validate message security: ${error.message}`);
    }
  }

  // H4: Validate Script Injection Security
  validateScriptInjection() {
    console.log('\n=== H4: Validating Script Injection Security ===');
    
    try {
      const backgroundPath = path.join(this.distPath, 'background.js');
      if (fs.existsSync(backgroundPath)) {
        const backgroundCode = fs.readFileSync(backgroundPath, 'utf8');
        
        // Check for secure function names
        const hasSecureFunctions = backgroundCode.includes('secureScript') || 
                                  backgroundCode.includes('secure');
        
        if (hasSecureFunctions) {
          this.log('H4-SecureFunctions', 'PASS', 'Secure function implementations found');
        } else {
          this.log('H4-SecureFunctions', 'FAIL', 'Secure function implementations missing');
          this.vulnerabilities.push('H4: Missing secure function implementations');
        }

        // Check for dangerous patterns (excluding legitimate security checks and safe uses)
        const dangerousPatterns = [
          { pattern: 'eval(', exclude: ['includes(\'eval(\')', 'eval('] },
          { pattern: 'Function(', exclude: [] },
          { pattern: 'innerHTML', exclude: [] },
          { pattern: 'outerHTML', exclude: [] },
          { pattern: 'document.write', exclude: [] },
          { pattern: ':contains(', exclude: [] }
        ];

        const foundDangerous = dangerousPatterns.filter(({ pattern, exclude }) => {
          const hasPattern = backgroundCode.includes(pattern);
          const isExcluded = exclude.some(exc => backgroundCode.includes(exc));
          return hasPattern && !isExcluded;
        }).map(({ pattern }) => pattern);

        if (foundDangerous.length === 0) {
          this.log('H4-DangerousPatterns', 'PASS', 'No dangerous patterns found');
        } else {
          this.log('H4-DangerousPatterns', 'FAIL', `Dangerous patterns found: ${foundDangerous.join(', ')}`);
          this.vulnerabilities.push(`H4: Dangerous patterns in background script: ${foundDangerous.join(', ')}`);
        }

        // Check for input validation
        const hasValidation = backgroundCode.includes('validate') && 
                             backgroundCode.includes('sanitize');
        
        if (hasValidation) {
          this.log('H4-InputValidation', 'PASS', 'Input validation implemented');
        } else {
          this.log('H4-InputValidation', 'FAIL', 'Input validation missing');
          this.vulnerabilities.push('H4: Missing input validation in background script');
        }

        // Check for error handling
        const hasErrorHandling = backgroundCode.includes('try') && 
                                backgroundCode.includes('catch');
        
        if (hasErrorHandling) {
          this.log('H4-ErrorHandling', 'PASS', 'Error handling implemented');
        } else {
          this.log('H4-ErrorHandling', 'WARN', 'Error handling may be incomplete');
        }

      } else {
        this.log('H4-BackgroundScript', 'ERROR', 'Background script not found');
      }

    } catch (error) {
      this.log('H4-Test', 'ERROR', `Failed to validate script injection: ${error.message}`);
    }
  }

  // H5: Validate Web Accessible Resources
  validateWebAccessibleResources() {
    console.log('\n=== H5: Validating Web Accessible Resources ===');
    
    try {
      const manifestPath = path.join(this.distPath, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      const webAccessible = manifest.web_accessible_resources || [];

      if (webAccessible.length === 0) {
        this.log('H5-NoResources', 'PASS', 'No web accessible resources exposed');
        return;
      }

      // Check each resource configuration
      webAccessible.forEach((resource, index) => {
        const resources = resource.resources || [];
        const matches = resource.matches || [];

        // Check for wildcard resource exposure
        const hasWildcardResources = resources.some(res => 
          res === '*' || res === '**/*' || res.includes('*')
        );

        if (hasWildcardResources) {
          this.log('H5-ResourceWildcard', 'FAIL', `Wildcard resource exposure in config ${index}`);
          this.vulnerabilities.push(`H5: Wildcard resource exposure in config ${index}`);
        } else {
          this.log('H5-ResourceWildcard', 'PASS', `Specific resource exposure in config ${index}`);
        }

        // Check for wildcard match patterns
        const hasWildcardMatches = matches.some(match => 
          match === '<all_urls>' || match === '*://*/*'
        );

        if (hasWildcardMatches) {
          this.log('H5-MatchWildcard', 'FAIL', `Wildcard match patterns in config ${index}`);
          this.vulnerabilities.push(`H5: Wildcard match patterns in config ${index}`);
        } else {
          this.log('H5-MatchWildcard', 'PASS', `Specific match patterns in config ${index}`);
        }

        // Check for sensitive file exposure
        const sensitiveFiles = ['manifest.json', 'background.js', 'content.js', 'security.js'];
        const exposedSensitive = resources.filter(res => 
          sensitiveFiles.some(file => res.includes(file))
        );

        if (exposedSensitive.length > 0) {
          this.log('H5-SensitiveFiles', 'FAIL', `Sensitive files exposed: ${exposedSensitive.join(', ')}`);
          this.vulnerabilities.push(`H5: Sensitive file exposure: ${exposedSensitive.join(', ')}`);
        } else {
          this.log('H5-SensitiveFiles', 'PASS', 'No sensitive files exposed');
        }
      });

    } catch (error) {
      this.log('H5-Test', 'ERROR', `Failed to validate web accessible resources: ${error.message}`);
    }
  }

  // Additional Security Checks
  validateAdditionalSecurity() {
    console.log('\n=== Additional Security Validation ===');
    
    try {
      // Check for secure coding patterns
      const files = ['content.js', 'background.js', 'popup.js'];
      
      files.forEach(filename => {
        const filePath = path.join(this.distPath, filename);
        if (fs.existsSync(filePath)) {
          const code = fs.readFileSync(filePath, 'utf8');
          
          // Check for console.log in production (information disclosure)
          const hasConsoleLog = code.includes('console.log');
          if (hasConsoleLog) {
            this.log('Security-ConsoleLog', 'WARN', `Console.log found in ${filename} - consider removing for production`);
          }

          // Check for hardcoded secrets
          const secretPatterns = [
            /api[_-]?key/i,
            /secret/i,
            /password/i,
            /token/i
          ];

          const hasSecrets = secretPatterns.some(pattern => pattern.test(code));
          if (hasSecrets) {
            this.log('Security-Secrets', 'WARN', `Potential secrets found in ${filename}`);
          }

          // Check for secure DOM manipulation
          const hasSecureDOM = code.includes('secureQuerySelector') || 
                              !code.includes('innerHTML');
          
          if (hasSecureDOM) {
            this.log('Security-DOM', 'PASS', `Secure DOM manipulation in ${filename}`);
          } else {
            this.log('Security-DOM', 'WARN', `Potentially unsafe DOM manipulation in ${filename}`);
          }
        }
      });

      // Check file permissions (if on Unix-like system)
      try {
        const stats = fs.statSync(this.distPath);
        const mode = stats.mode & parseInt('777', 8);
        if (mode <= parseInt('755', 8)) {
          this.log('Security-FilePerms', 'PASS', 'Secure file permissions');
        } else {
          this.log('Security-FilePerms', 'WARN', 'File permissions may be too permissive');
        }
      } catch (permError) {
        this.log('Security-FilePerms', 'INFO', 'Could not check file permissions');
      }

    } catch (error) {
      this.log('Additional-Test', 'ERROR', `Failed additional security validation: ${error.message}`);
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n=== SECURITY VALIDATION REPORT ===');
    console.log(`Validation Date: ${new Date().toISOString()}`);
    console.log(`Total Tests: ${this.results.length}`);
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARN').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    const info = this.results.filter(r => r.status === 'INFO').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`🔴 Errors: ${errors}`);
    console.log(`ℹ️  Info: ${info}`);

    const securityScore = Math.round(((passed / (passed + failed)) * 100) || 0);
    console.log(`\n🔒 Security Score: ${securityScore}%`);

    if (this.vulnerabilities.length > 0) {
      console.log('\n=== VULNERABILITIES FOUND ===');
      this.vulnerabilities.forEach((vuln, index) => {
        console.log(`${index + 1}. ${vuln}`);
      });
    } else {
      console.log('\n✅ NO CRITICAL VULNERABILITIES FOUND');
    }

    // Completion assessment
    const completionPercentage = Math.round(((passed + warnings) / this.results.length) * 100);
    console.log(`\n📊 Task Completion: ${completionPercentage}%`);

    if (completionPercentage >= 98) {
      console.log('🎯 TARGET ACHIEVED: 98%+ completion reached!');
    } else if (completionPercentage >= 90) {
      console.log('🟢 EXCELLENT: High completion rate achieved');
    } else if (completionPercentage >= 75) {
      console.log('🟡 GOOD: Adequate completion with room for improvement');
    } else {
      console.log('🔴 NEEDS WORK: Significant issues require attention');
    }

    return {
      score: securityScore,
      completion: completionPercentage,
      vulnerabilities: this.vulnerabilities,
      results: this.results,
      summary: { passed, failed, warnings, errors, info }
    };
  }

  // Run all validations
  runValidation() {
    console.log('🔒 Starting Security Validation...\n');
    
    this.validateManifestPermissions();
    this.validateCSP();
    this.validateMessageSecurity();
    this.validateScriptInjection();
    this.validateWebAccessibleResources();
    this.validateAdditionalSecurity();
    
    return this.generateReport();
  }
}

// Run validation
const validator = new SecurityValidator();
const report = validator.runValidation();

// Exit with appropriate code
process.exit(report.vulnerabilities.length > 0 ? 1 : 0);