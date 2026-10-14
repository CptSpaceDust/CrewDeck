import { Component } from "react";
import { RefreshCw } from "lucide-react";

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.page !== this.props.page && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel page-crash-card" role="alert">
        <span className="eyebrow">CrewDeck recovered this page</span>
        <h2>This screen hit a rendering problem</h2>
        <p>{this.state.error?.message || "The page could not be displayed."}</p>
        <button
          className="button primary"
          onClick={() => this.setState({ error: null })}
        >
          <RefreshCw /> Try this page again
        </button>
      </section>
    );
  }
}
