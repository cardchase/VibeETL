import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Activity, Target, BrainCircuit, AlertCircle, RefreshCw } from 'lucide-react';

const MatchCard = ({ match }) => {
  const [activeTab, setActiveTab] = useState('Conservative');

  // Probability bars mapping
  const probHome = parseFloat(match.Prob_Home) || 0;
  const probDraw = parseFloat(match.Prob_Draw) || 0;
  const probAway = parseFloat(match.Prob_Away) || 0;
  const totalProb = probHome + probDraw + probAway || 1;

  // Expected Value logic
  const evHome = parseFloat(match.EV_Home) || 0;
  const isHighEv = evHome > 1.05; // Anything > 1.05 is positive expected value

  // Predicted score logic based on tab
  const getPredictedScore = () => {
    if (activeTab === 'Conservative') return `${match.Predicted_FT_HomeScore_Conservative || '?'} - ${match.Predicted_FT_AwayScore_Conservative || '?'}`;
    if (activeTab === 'Exciting') return `${match.Predicted_FT_HomeScore_Exciting || '?'} - ${match.Predicted_FT_AwayScore_Exciting || '?'}`;
    if (activeTab === 'Underdog') return `${match.Predicted_FT_HomeScore_Underdog || '?'} - ${match.Predicted_FT_AwayScore_Underdog || '?'}`;
    return `${match.Predicted_FT_HomeScore || '?'} - ${match.Predicted_FT_AwayScore || '?'}`;
  };

  // Narrative logic
  const getNarrative = () => {
    if (activeTab === 'Conservative') return match['Engine_Match_Narrative_Conservative'] || 'A tight, conservative game expected.';
    if (activeTab === 'Exciting') return match['Engine_Match_Narrative_Exciting'] || 'An end-to-end exciting clash.';
    if (activeTab === 'Underdog') return match['Engine_Match_Narrative_Underdog'] || 'Potential for an upset today.';
    return match['Engine_Match_Narrative_Conservative'];
  };

  return (
    <div className="glass-card animate-fade-in">
      <div className="match-header">
        <span className="match-competition">{match.Competition}</span>
        <span className="match-time">{match.Date} {match.Time}</span>
      </div>

      <div className="teams-container">
        <span>{match.HomeTeam}</span>
        <span className="team-vs">VS</span>
        <span>{match.AwayTeam}</span>
      </div>

      <div className="prob-bar-container" title={`Home: ${(probHome/totalProb*100).toFixed(0)}% | Draw: ${(probDraw/totalProb*100).toFixed(0)}% | Away: ${(probAway/totalProb*100).toFixed(0)}%`}>
        <div className="prob-segment prob-home" style={{ width: `${(probHome / totalProb) * 100}%` }}></div>
        <div className="prob-segment prob-draw" style={{ width: `${(probDraw / totalProb) * 100}%` }}></div>
        <div className="prob-segment prob-away" style={{ width: `${(probAway / totalProb) * 100}%` }}></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Home Odds</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{match.FT_HomeOdds || '-'}</div>
          {evHome > 0 && (
            <div className={`ev-badge ${isHighEv ? 'ev-positive' : 'ev-negative'}`}>
              EV: {evHome.toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Prediction</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-blue)' }}>
            {getPredictedScore()}
          </div>
        </div>
      </div>

      <div className="tabs-container">
        {['Conservative', 'Exciting', 'Underdog'].map(tab => (
          <button 
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="narrative-box">
        {getNarrative()}
      </div>
    </div>
  );
};

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = () => {
    setLoading(true);
    // Note: We expect the CSV to be available in the public folder or served nearby.
    // For local dev, put predictions_intermediate.csv in /public folder.
    fetch('/predictions_intermediate.csv')
      .then(response => {
        if (!response.ok) throw new Error('Could not load predictions CSV.');
        return response.text();
      })
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            // Filter out empty rows or headers mistakenly parsed
            const validMatches = results.data.filter(row => row.HomeTeam && row.AwayTeam);
            setData(validMatches.reverse().slice(0, 50)); // Take newest 50
            setLoading(false);
          }
        });
      })
      .catch(err => {
        console.error(err);
        setError("Error loading CSV file. Please make sure predictions_intermediate.csv is in the public/ folder.");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">VibeETL Predictions</h1>
          <div className="dashboard-subtitle">
            <BrainCircuit size={18} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '8px' }} />
            AI-Driven Match Analytics & EV Hub
          </div>
        </div>
        <div>
          <button 
            onClick={loadData}
            style={{ 
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
              color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <AlertCircle size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="spinner"></div>
      ) : (
        <div className="grid-container">
          {data.map((match, idx) => (
            <MatchCard key={idx} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
