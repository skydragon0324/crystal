import React, { useState, useEffect } from 'react';
import ReactApexChart from 'react-apexcharts';

const LineChart = (props) => {
  const [chartData, setChartData] = useState([]);
  const [chartOptions, setChartOptions] = useState({});
  
  useEffect(() => {
    setChartData(props.chartData);
    setChartOptions(props.chartOptions);
  }, [props]);

  return (
    <ReactApexChart
      options={chartOptions}
      series={chartData}
      type="area"
      width="100%"
      height="100%"
    />
  );
}

export default LineChart;
