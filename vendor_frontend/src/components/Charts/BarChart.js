import React from 'react';
import Chart from 'react-apexcharts';

const BarChart = (props) => {
  const { chartData, chartOptions, ...rest } = props;

  return (
    <Chart
      options={chartOptions}
      series={chartData}
      type="bar"
      {...rest}
    />
  );
}

export default BarChart;
