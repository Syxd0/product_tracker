import React from 'react';
import './TaglineSection.css';

const TaglineSection = () => {
  return (
    <div className="tagline-card">
      <div className="tagline-content">
        <div className="tagline-badge">
          <span className="tagline-icon">📦</span>
          <span>Product Tracker Pro</span>
        </div>
        <h3>Track. Manage. Grow.</h3>
        <p>
          Streamline your inventory with real-time analytics, user-isolated product records, and effortless tracking designed for modern workflows.
        </p>
        <div className="tagline-features">
          <span className="feature-pill">✓ Secure Multi-tenant</span>
          <span className="feature-pill">✓ Real-time Sync</span>
          <span className="feature-pill">✓ Stock Alerts</span>
        </div>
      </div>
    </div>
  );
};

export default TaglineSection;
