import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Neo-brutalist OG: cream bg with dot grid, black top bar, big Syne wordmark,
// yellow "NO HARDWARE NEEDED" stamp, colored verification pills.
export default function handler() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#FEFCE8',
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #111111 1.5px, transparent 0)',
          backgroundSize: '24px 24px',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        },
        children: [
          // Top bar
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#111111',
                color: '#FEFCE8',
                padding: '18px 40px',
                borderBottom: '3px solid #111111',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '12px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '18px',
                            height: '18px',
                            background: '#FACC15',
                            border: '2px solid #FEFCE8',
                          },
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '24px',
                            fontWeight: 800,
                            letterSpacing: '-0.5px',
                          },
                          children: 'PAL-TECH ATTENDANCE',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '2px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '10px',
                            height: '10px',
                            background: '#16A34A',
                            borderRadius: '50%',
                          },
                        },
                      },
                      'ONLINE',
                    ],
                  },
                },
              ],
            },
          },
          // Main card
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                margin: '60px 80px',
                background: '#FFFFFF',
                border: '4px solid #111111',
                boxShadow: '8px 8px 0 #111111',
                padding: '48px',
                flex: 1,
                position: 'relative',
              },
              children: [
                // Tag
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignSelf: 'flex-start',
                      background: '#111111',
                      color: '#FEFCE8',
                      fontSize: '16px',
                      fontWeight: 700,
                      letterSpacing: '3px',
                      padding: '6px 14px',
                      marginBottom: '28px',
                    },
                    children: '● EMPLOYEE LOG',
                  },
                },
                // Headline
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontSize: '110px',
                      fontWeight: 800,
                      letterSpacing: '-4px',
                      lineHeight: 0.95,
                      color: '#111111',
                    },
                    children: 'CLOCK IN.',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontSize: '110px',
                      fontWeight: 800,
                      letterSpacing: '-4px',
                      lineHeight: 0.95,
                      color: '#111111',
                      marginTop: '8px',
                    },
                    children: 'CLOCK OUT.',
                  },
                },
                // Subhead
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontSize: '22px',
                      fontWeight: 500,
                      color: '#555555',
                      marginTop: '28px',
                      maxWidth: '700px',
                    },
                    children:
                      'QR attendance for small shops. No hardware. Verified by WiFi + GPS.',
                  },
                },
                // Pills row
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '12px',
                      marginTop: '32px',
                    },
                    children: [
                      pill('QR SCAN', '#16A34A', '#111'),
                      pill('GEOFENCE', '#FACC15', '#111'),
                      pill('WIFI AUTH', '#2563EB', '#FFF'),
                    ],
                  },
                },
                // Stamp (top-right)
                {
                  type: 'div',
                  props: {
                    style: {
                      position: 'absolute',
                      top: '60px',
                      right: '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '180px',
                      height: '180px',
                      background: '#FACC15',
                      border: '4px solid #111111',
                      boxShadow: '6px 6px 0 #111111',
                      transform: 'rotate(8deg)',
                      padding: '16px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: '14px', fontWeight: 700, letterSpacing: '2px' },
                          children: 'NO',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '26px',
                            fontWeight: 800,
                            letterSpacing: '-1px',
                            margin: '6px 0',
                          },
                          children: 'HARDWARE',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '14px',
                            fontWeight: 700,
                            letterSpacing: '2px',
                            borderTop: '2px solid #111',
                            paddingTop: '6px',
                            width: '100%',
                            textAlign: 'center',
                            display: 'flex',
                            justifyContent: 'center',
                          },
                          children: 'NEEDED',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Footer stripe
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#111111',
                color: '#FEFCE8',
                padding: '14px 40px',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '2px',
              },
              children: [
                { type: 'div', props: { children: '// BUILT BY LESLIE PAUL' } },
                {
                  type: 'div',
                  props: {
                    style: { color: '#FACC15' },
                    children: 'PAL-TECH.ATTENDANCE',
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}

function pill(text, bg, color) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color,
        border: '3px solid #111111',
        padding: '8px 18px',
        fontSize: '16px',
        fontWeight: 700,
        letterSpacing: '2px',
      },
      children: text,
    },
  };
}
