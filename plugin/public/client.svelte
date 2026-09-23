<script>

  let lastRtt = null;
  let totalPings = 0;
  let log = [];

  function ping () {
    tools.emit('ping', { sentAt: Date.now() });
  }

  tools.on('pong', (data) => {
    lastRtt = Date.now() - data.sentAt;
  });

  tools.on('pinged', (data) => {
    totalPings = data.totalPings;
    log = [data.nick + ' pinged', ...log].slice(0, 10);
  });

  tools.on('stats', (data) => {
    totalPings = data.totalPings;
  });

  tools.emit('getstats');

</script>

<div class="container">
  <button on:click={ping}>Ping</button>

  <p class="rtt">
    {#if lastRtt === null}
      no pong yet
    {:else}
      pong! {lastRtt}ms
    {/if}
  </p>

  <p class="total">{totalPings} pings total</p>

  <ul>
    {#each log as entry}
      <li>{entry}</li>
    {/each}
  </ul>
</div>

<style>

  .container {
    color: white;
    padding: 10px;
    font-family: 'Montserrat', sans-serif;
  }

  button {
    border: 1px solid #000;
    border-radius: 3px;
    color: white;
    padding: 10px 20px;
    cursor: pointer;
    background-color: #39f;
    font-size: 18px;
    font-weight: bold;
    box-shadow: 0px 1px 4px 0px #111;
  }

  .rtt {
    font-size: 20px;
  }

  .total {
    color: #aaa;
  }

  ul {
    padding-left: 18px;
  }

</style>
