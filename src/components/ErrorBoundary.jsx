import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, Arial", color: "#b91c1c" }}>
          <b>Something went wrong.</b>
          <div style={{ marginTop: 8, color: "#334155", fontSize: 12 }}>
            Please check the browser console for details.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
