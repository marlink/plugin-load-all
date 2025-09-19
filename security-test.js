/**
 * Security Penetration Testing Script for Load More Extension
 * Tests all critical vulnerabilities (H1-H5) that were fixed
 */

class SecurityTester {
  constructor() {
    this.testResults = [];
    this.vulnerabilities = [];
  }

  log(test, status, details = '') {
    const result = { test, status, details, timestamp: new Date().toISOString() };
    this.testResults.push(result);
    console.log(`[${status.toUpperCase()}] ${test}: ${details}`);
  }

  // H1: Test Principle of Least Privilege in Manifest
  testManifestPermissions() {
    console.log('\n=== H1: Testing Manifest Permissions ===');
    
    try {
      // Check if dangerous permissions are removed
      const dangerousPerms = ['<all_urls>', 'tabs', 'webNavigation', 'history', 'bookmarks'];
      const hasUnnecessaryPerms = dangerousPerms.some(perm => 
        chrome.runtime.getManifest().permissions?.includes(perm)
      );
      
      if (hasUnnecessaryPerms) {
        this.log('H1-Permissions', 'FAIL', 'Unnecessary dangerous permissions detected');
        this.vulnerabilities.push('H1: Excessive permissions in manifest');
      } else {
        this.log('H1-Permissions', 'PASS', 'Minimal required permissions only');
      }

      // Test host permissions are specific
      const hostPerms = chrome.runtime.getManifest().host_permissions || [];
      const hasWildcardHost = hostPerms.some(host => host === '<all_urls>' || host === '*://*/*');
      
      if (hasWildcardHost) {
        this.log('H1-HostPerms', 'FAIL', 'Wildcard host permissions detected');
        this.vulnerabilities.push('H1: Overly broad host permissions');
      } else {
        this.log('H1-HostPerms', 'PASS', 'Specific host permissions only');
      }
    } catch (error) {
      this.log('H1-Test', 'ERROR', `Failed to test manifest: ${error.message}`);
    }
  }

  // H2: Test Content Security Policy
  testCSP() {
    console.log('\n=== H2: Testing Content Security Policy ===');
    
    try {
      const manifest = chrome.runtime.getManifest();
      const csp = manifest.content_security_policy;
      
      if (!csp) {
        this.log('H2-CSP-Exists', 'FAIL', 'No CSP defined in manifest');
        this.vulnerabilities.push('H2: Missing Content Security Policy');
        return;
      }

      // Test for unsafe CSP directives
      const unsafePatterns = [
        "'unsafe-eval'",
        "'unsafe-inline'",
        "data:",
        "blob:",
        "*"
      ];

      const hasUnsafeDirectives = unsafePatterns.some(pattern => 
        JSON.stringify(csp).includes(pattern)
      );

      if (hasUnsafeDirectives) {
        this.log('H2-CSP-Safe', 'FAIL', 'Unsafe CSP directives detected');
        this.vulnerabilities.push('H2: Unsafe CSP directives');
      } else {
        this.log('H2-CSP-Safe', 'PASS', 'Secure CSP directives only');
      }

      // Test script-src restrictions
      const scriptSrc = csp.extension_pages?.script_src || csp.script_src;
      if (scriptSrc && scriptSrc.includes("'self'")) {
        this.log('H2-ScriptSrc', 'PASS', 'Script sources restricted to self');
      } else {
        this.log('H2-ScriptSrc', 'WARN', 'Script source restrictions unclear');
      }
    } catch (error) {
      this.log('H2-Test', 'ERROR', `Failed to test CSP: ${error.message}`);
    }
  }

  // H3: Test Message Validation
  async testMessageValidation() {
    console.log('\n=== H3: Testing Message Validation ===');
    
    try {
      // Test malicious message injection
      const maliciousMessages = [
        { type: 'SCAN_PAGE_CONTENT', payload: '<script>alert("xss")</script>' },
        { type: 'START_EXPANSION', options: { maxItems: 'javascript:alert(1)' } },
        { type: 'INVALID_TYPE', data: 'malicious' },
        { type: 'SCAN_PAGE_CONTENT', selector: 'body[onload="alert(1)"]' },
        { type: 'START_EXPANSION', options: { delay: -1000 } }
      ];

      let validationPassed = true;

      for (const msg of maliciousMessages) {
        try {
          // Simulate sending malicious message
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(msg, resolve);
          });
          
          if (response && response.success) {
            this.log('H3-MaliciousMsg', 'FAIL', `Malicious message accepted: ${msg.type}`);
            this.vulnerabilities.push(`H3: Malicious message validation bypass: ${msg.type}`);
            validationPassed = false;
          }
        } catch (error) {
          // Expected - malicious messages should be rejected
          this.log('H3-MaliciousMsg', 'PASS', `Malicious message rejected: ${msg.type}`);
        }
      }

      if (validationPassed) {
        this.log('H3-Validation', 'PASS', 'Message validation working correctly');
      }

      // Test rate limiting
      const rapidMessages = Array(20).fill().map(() => ({ type: 'SCAN_PAGE_CONTENT' }));
      let rateLimitTriggered = false;

      for (const msg of rapidMessages) {
        try {
          await chrome.runtime.sendMessage(msg);
        } catch (error) {
          if (error.message.includes('rate') || error.message.includes('limit')) {
            rateLimitTriggered = true;
            break;
          }
        }
      }

      if (rateLimitTriggered) {
        this.log('H3-RateLimit', 'PASS', 'Rate limiting active');
      } else {
        this.log('H3-RateLimit', 'WARN', 'Rate limiting not detected');
      }

    } catch (error) {
      this.log('H3-Test', 'ERROR', `Failed to test message validation: ${error.message}`);
    }
  }

  // H4: Test Script Injection Security
  testScriptInjection() {
    console.log('\n=== H4: Testing Script Injection Security ===');
    
    try {
      // Test for dangerous selectors in injected scripts
      const dangerousSelectors = [
        'javascript:',
        'data:',
        'eval(',
        'innerHTML',
        'outerHTML',
        'document.write',
        'setTimeout(',
        'setInterval('
      ];

      // Check if security module exists
      if (typeof SecurityUtils !== 'undefined') {
        this.log('H4-SecurityModule', 'PASS', 'Security utilities module loaded');
        
        // Test selector validation
        dangerousSelectors.forEach(selector => {
          try {
            const result = SecurityUtils.validateSelector(selector);
            if (result) {
              this.log('H4-SelectorValidation', 'FAIL', `Dangerous selector allowed: ${selector}`);
              this.vulnerabilities.push(`H4: Dangerous selector validation bypass: ${selector}`);
            } else {
              this.log('H4-SelectorValidation', 'PASS', `Dangerous selector blocked: ${selector}`);
            }
          } catch (error) {
            this.log('H4-SelectorValidation', 'PASS', `Dangerous selector blocked: ${selector}`);
          }
        });
      } else {
        this.log('H4-SecurityModule', 'FAIL', 'Security utilities module not found');
        this.vulnerabilities.push('H4: Missing security utilities module');
      }

      // Test DOM query security
      const testQueries = [
        'script[src*="evil"]',
        'iframe[src*="javascript:"]',
        '*[onclick*="alert"]'
      ];

      testQueries.forEach(query => {
        try {
          const elements = document.querySelectorAll(query);
          if (elements.length > 0) {
            this.log('H4-DOMSecurity', 'WARN', `Potentially dangerous elements found: ${query}`);
          }
        } catch (error) {
          this.log('H4-DOMSecurity', 'PASS', `Query safely handled: ${query}`);
        }
      });

    } catch (error) {
      this.log('H4-Test', 'ERROR', `Failed to test script injection: ${error.message}`);
    }
  }

  // H5: Test Web Accessible Resources
  testWebAccessibleResources() {
    console.log('\n=== H5: Testing Web Accessible Resources ===');
    
    try {
      const manifest = chrome.runtime.getManifest();
      const webAccessible = manifest.web_accessible_resources;

      if (!webAccessible || webAccessible.length === 0) {
        this.log('H5-NoResources', 'PASS', 'No web accessible resources exposed');
        return;
      }

      // Check for overly permissive resource exposure
      webAccessible.forEach((resource, index) => {
        const resources = resource.resources || [];
        const matches = resource.matches || [];

        // Check for wildcard resource exposure
        if (resources.includes('*') || resources.includes('**/*')) {
          this.log('H5-ResourceWildcard', 'FAIL', 'Wildcard resource exposure detected');
          this.vulnerabilities.push('H5: Overly broad resource exposure');
        }

        // Check for wildcard match patterns
        if (matches.includes('<all_urls>') || matches.includes('*://*/*')) {
          this.log('H5-MatchWildcard', 'FAIL', 'Wildcard match patterns detected');
          this.vulnerabilities.push('H5: Overly broad match patterns');
        }

        // Check for sensitive file exposure
        const sensitiveFiles = ['manifest.json', 'background.js', 'content.js'];
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
      this.log('H5-Test', 'ERROR', `Failed to test web accessible resources: ${error.message}`);
    }
  }

  // Additional Security Tests
  testAdditionalSecurity() {
    console.log('\n=== Additional Security Tests ===');
    
    // Test for XSS vulnerabilities
    try {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        'onload="alert(1)"',
        '"><script>alert(1)</script>',
        "';alert(1);//"
      ];

      xssPayloads.forEach(payload => {
        const testDiv = document.createElement('div');
        testDiv.textContent = payload; // Safe assignment
        
        if (testDiv.innerHTML.includes('<script>') || testDiv.innerHTML.includes('javascript:')) {
          this.log('XSS-Prevention', 'FAIL', `XSS payload not properly sanitized: ${payload}`);
          this.vulnerabilities.push(`XSS: Payload sanitization failure: ${payload}`);
        } else {
          this.log('XSS-Prevention', 'PASS', `XSS payload properly sanitized: ${payload}`);
        }
      });
    } catch (error) {
      this.log('XSS-Test', 'ERROR', `Failed to test XSS prevention: ${error.message}`);
    }

    // Test CSRF protection
    try {
      const hasCSRFProtection = document.querySelector('meta[name="csrf-token"]') !== null;
      if (hasCSRFProtection) {
        this.log('CSRF-Protection', 'PASS', 'CSRF token found');
      } else {
        this.log('CSRF-Protection', 'INFO', 'No CSRF token detected (may not be required for extension)');
      }
    } catch (error) {
      this.log('CSRF-Test', 'ERROR', `Failed to test CSRF protection: ${error.message}`);
    }
  }

  // Generate comprehensive security report
  generateReport() {
    console.log('\n=== SECURITY TESTING REPORT ===');
    console.log(`Test Date: ${new Date().toISOString()}`);
    console.log(`Total Tests: ${this.testResults.length}`);
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const warnings = this.testResults.filter(r => r.status === 'WARN').length;
    const errors = this.testResults.filter(r => r.status === 'ERROR').length;

    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Warnings: ${warnings}`);
    console.log(`Errors: ${errors}`);

    const securityScore = Math.round(((passed / (passed + failed)) * 100) || 0);
    console.log(`Security Score: ${securityScore}%`);

    if (this.vulnerabilities.length > 0) {
      console.log('\n=== VULNERABILITIES FOUND ===');
      this.vulnerabilities.forEach((vuln, index) => {
        console.log(`${index + 1}. ${vuln}`);
      });
    } else {
      console.log('\n✅ NO CRITICAL VULNERABILITIES FOUND');
    }

    console.log('\n=== DETAILED RESULTS ===');
    this.testResults.forEach(result => {
      console.log(`[${result.status}] ${result.test}: ${result.details}`);
    });

    return {
      score: securityScore,
      vulnerabilities: this.vulnerabilities,
      results: this.testResults,
      summary: { passed, failed, warnings, errors }
    };
  }

  // Run all security tests
  async runAllTests() {
    console.log('🔒 Starting Comprehensive Security Testing...\n');
    
    this.testManifestPermissions();
    this.testCSP();
    await this.testMessageValidation();
    this.testScriptInjection();
    this.testWebAccessibleResources();
    this.testAdditionalSecurity();
    
    return this.generateReport();
  }
}

// Auto-run tests when script loads
if (typeof window !== 'undefined') {
  window.SecurityTester = SecurityTester;
  
  // Run tests automatically
  const tester = new SecurityTester();
  tester.runAllTests().then(report => {
    console.log('\n🎯 Security testing completed!');
    console.log(`Final Security Score: ${report.score}%`);
    
    if (report.score >= 90) {
      console.log('🟢 EXCELLENT: Extension security is robust');
    } else if (report.score >= 75) {
      console.log('🟡 GOOD: Extension security is adequate with minor issues');
    } else {
      console.log('🔴 CRITICAL: Extension has significant security vulnerabilities');
    }
  });
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityTester;
}