using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class BallRetainer : MonoBehaviour
{
    Major_Connector upperMJ;
    Major_Connector lowerMJ;

    // Start is called before the first frame update
    void Start()
    {
        upperMJ = DLLIntegration.instance.jUpper.major_c;
        lowerMJ = DLLIntegration.instance.jLower.major_c;
    }

    // Update is called once per frame
    void Update()
    {
        
    }
    /// <summary>
    /// Unused, for future use if acrylic components are implement into library with DLL
    /// </summary>
    /// <param name="index">Input of the index/position of the ball retainer</param>
    public void SetUpperBallRetainer(int index)
    {
        upperMJ.ball_connector[index] = 1;
    }
    /// <summary>
    /// Unused, for future use if acrylic components are implement into library with DLL
    /// </summary>
    /// <param name="index">Input of the index/position of the ball retainer</param>
    public void SetLowerBallRetainer(int index)
    {
        lowerMJ.ball_connector[index] = 1;
    }
}
